/**
 * Relationship Signal Extraction
 * Real-time pattern matching for relationship detection
 *
 * Key insight: We only detect relationships from DIRECT ADDRESS patterns
 * - "Hey boss" = user addresses contact as boss → manager relationship
 * - "my boss wants..." = mentions having a boss, NOT about this contact (ignored)
 */

import { redisClient } from '../redis/client.js';

// Types
export type RelationshipType =
  | 'colleague'
  | 'client'
  | 'manager'
  | 'friend'
  | 'acquaintance'
  | 'family'
  | 'romantic_partner';

export interface RelationshipSignal {
  type: RelationshipType;
  confidence: number;
  evidence: string;
  source: 'outgoing' | 'incoming';
}

export interface RelationshipSignalQueueItem {
  contactId: string;
  signal: RelationshipSignal;
  timestamp: number;
  messageId: string;
}

// Pattern definitions with confidence scores
interface PatternDef {
  pattern: RegExp;
  type: RelationshipType;
  confidence: number;
}

/**
 * Tier 1A: User's Outgoing Messages (user addresses the contact)
 * These patterns detect how the user addresses the person they're talking to
 */
const OUTGOING_PATTERNS: PatternDef[] = [
  // Family - high confidence
  { pattern: /^(hi|hey|hello|good morning|good evening)\s+(mom|mum|mama|mother)\b/i, type: 'family', confidence: 0.95 },
  { pattern: /^(hi|hey|hello|good morning|good evening)\s+(dad|papa|father)\b/i, type: 'family', confidence: 0.95 },
  { pattern: /^(hi|hey|hello)\s+(sis|bro|brother|sister)\b/i, type: 'family', confidence: 0.90 },
  { pattern: /\b(love you|miss you)\s*(mom|mum|dad|papa|sis|bro)?\s*$/i, type: 'family', confidence: 0.85 },

  // Romantic partner - high confidence
  { pattern: /^(hi|hey|hello|good morning|good evening)\s+(babe|baby|honey|sweetheart|darling|love)\b/i, type: 'romantic_partner', confidence: 0.90 },
  { pattern: /\b(love you|miss you)\s*(babe|baby|honey|dear)?\s*$/i, type: 'romantic_partner', confidence: 0.85 },
  { pattern: /^(good\s*(morning|night))\s*(babe|baby|honey|my love)\b/i, type: 'romantic_partner', confidence: 0.90 },

  // Manager - high confidence
  { pattern: /^(hi|hey|hello|good morning)\s+boss\b/i, type: 'manager', confidence: 0.90 },
  { pattern: /^dear\s+(mr|ms|mrs|miss|dr)\.?\s+\w+/i, type: 'manager', confidence: 0.75 },
  { pattern: /^(good morning|good afternoon)\s+(sir|ma'am|madam)\b/i, type: 'manager', confidence: 0.80 },

  // Client - medium confidence
  { pattern: /^dear\s+(valued\s+)?client\b/i, type: 'client', confidence: 0.85 },
  { pattern: /\bper\s+(our|your)\s+(contract|agreement|discussion)\b/i, type: 'client', confidence: 0.75 },
  { pattern: /\bfor\s+your\s+review\b.*\bplease\s+(let\s+me\s+know|advise)\b/i, type: 'client', confidence: 0.70 },

  // Colleague - medium confidence
  { pattern: /\b(regarding|re:|about)\s+(the|our)\s+(meeting|project|deadline|sprint)\b/i, type: 'colleague', confidence: 0.65 },
  { pattern: /^hi\s+team\b/i, type: 'colleague', confidence: 0.70 },

  // Friend - medium confidence
  { pattern: /^(yo|sup|what'?s\s+up|hey\s+dude|hey\s+man|hey\s+bro)\b/i, type: 'friend', confidence: 0.70 },
  { pattern: /^(yo|sup)\s*$/i, type: 'friend', confidence: 0.65 },
  { pattern: /\b(wanna|gonna)\s+(hang|chill|grab\s+(drinks?|beers?|food))\b/i, type: 'friend', confidence: 0.75 },
  { pattern: /\b(lol|lmao|haha)\s*$/i, type: 'friend', confidence: 0.50 },
];

/**
 * Tier 1B: Contact's Incoming Messages (contact addresses the user)
 * These patterns detect how the contact addresses the user
 */
const INCOMING_PATTERNS: PatternDef[] = [
  // Family (parent addressing child)
  { pattern: /^(son|daughter|kiddo|sweetie|honey),?\s/i, type: 'family', confidence: 0.90 },
  { pattern: /^(hey|hi)\s+(son|daughter|kiddo)\b/i, type: 'family', confidence: 0.90 },
  { pattern: /\bdon'?t\s+forget\s+to\s+.{0,30}\s*(sweetie|honey|dear)\b/i, type: 'family', confidence: 0.80 },

  // Romantic partner
  { pattern: /^(babe|baby|honey|sweetheart|darling|my love),?\s/i, type: 'romantic_partner', confidence: 0.90 },
  { pattern: /^(good\s*(morning|night))\s*(babe|baby|honey|love)\b/i, type: 'romantic_partner', confidence: 0.90 },
  { pattern: /\b(miss(ing)?\s+you|love\s+you)\s*(so\s+much)?\s*$/i, type: 'romantic_partner', confidence: 0.80 },

  // Manager addressing employee
  { pattern: /\bi\s+need\s+you\s+to\b/i, type: 'manager', confidence: 0.70 },
  { pattern: /\bas\s+your\s+(manager|supervisor|lead)\b/i, type: 'manager', confidence: 0.85 },
  { pattern: /\bplease\s+(ensure|make\s+sure)\s+(that|this)\b.*\bby\s+(EOD|end\s+of\s+day|tomorrow)\b/i, type: 'manager', confidence: 0.75 },
  { pattern: /\bI'?m\s+(assigning|delegating)\s+(this|you)\b/i, type: 'manager', confidence: 0.80 },

  // Client language
  { pattern: /\bwe'?re\s+paying\s+(you|for)\b/i, type: 'client', confidence: 0.80 },
  { pattern: /\bper\s+(our|the)\s+(contract|agreement|SLA)\b/i, type: 'client', confidence: 0.80 },
  { pattern: /\bdeliverables?\s+(are|were)\s+(due|expected)\b/i, type: 'client', confidence: 0.75 },

  // Friend language
  { pattern: /^(dude|bro|man),?\s/i, type: 'friend', confidence: 0.65 },
  { pattern: /\b(dude|bro|man),?\s+(you\s+)?gotta\s+(see|hear|check)\b/i, type: 'friend', confidence: 0.70 },
  { pattern: /^(lol|lmao|omg)\s/i, type: 'friend', confidence: 0.55 },
];

// Redis stream for relationship signals
const RELATIONSHIP_SIGNALS_QUEUE = 'QUEUE:relationship_signals';

/**
 * Extract relationship signals from message content
 *
 * @param content Message content
 * @param isOutgoing Whether this is an outgoing message from user
 * @returns Best matching signal or null
 */
export function extractRelationshipSignals(
  content: string,
  isOutgoing: boolean
): RelationshipSignal | null {
  const patterns = isOutgoing ? OUTGOING_PATTERNS : INCOMING_PATTERNS;
  const source = isOutgoing ? 'outgoing' : 'incoming';

  let bestMatch: RelationshipSignal | null = null;

  for (const { pattern, type, confidence } of patterns) {
    const match = content.match(pattern);
    if (match) {
      // Keep the highest confidence match
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          type,
          confidence,
          evidence: match[0].substring(0, 50), // Limit evidence length
          source,
        };
      }
    }
  }

  if (bestMatch) {
    console.log(
      `[RelationshipSignals] Detected: ${bestMatch.type} (${Math.round(bestMatch.confidence * 100)}%) from "${bestMatch.evidence}"`
    );
  }

  return bestMatch;
}

/**
 * Queue relationship signal for background processing
 * Fire-and-forget to avoid adding latency to the real-time path
 *
 * @param contactId Contact identifier
 * @param signal Extracted relationship signal
 * @param messageId Message identifier for deduplication
 */
export async function queueRelationshipSignal(
  contactId: string,
  signal: RelationshipSignal,
  messageId: string
): Promise<void> {
  try {
    const item: RelationshipSignalQueueItem = {
      contactId,
      signal,
      timestamp: Date.now(),
      messageId,
    };

    // Fire and forget - don't await
    redisClient.client
      .xadd(
        RELATIONSHIP_SIGNALS_QUEUE,
        '*', // Auto-generate ID
        'contactId',
        contactId,
        'type',
        signal.type,
        'confidence',
        signal.confidence.toString(),
        'evidence',
        signal.evidence,
        'source',
        signal.source,
        'messageId',
        messageId,
        'timestamp',
        item.timestamp.toString()
      )
      .catch((err) => {
        console.error('[RelationshipSignals] Failed to queue signal:', err);
      });

    console.log(
      `[RelationshipSignals] Queued signal for ${contactId}: ${signal.type} (${Math.round(signal.confidence * 100)}%)`
    );
  } catch (err) {
    // Don't throw - this is fire-and-forget
    console.error('[RelationshipSignals] Error queuing signal:', err);
  }
}

/**
 * Check if a signal is high-confidence enough for immediate use
 * High-confidence signals (≥0.9) can be used optimistically
 */
export function isHighConfidenceSignal(signal: RelationshipSignal | null): boolean {
  return signal !== null && signal.confidence >= 0.9;
}

/**
 * Get all relationship types for validation
 */
export function getRelationshipTypes(): RelationshipType[] {
  return ['colleague', 'client', 'manager', 'friend', 'acquaintance', 'family', 'romantic_partner'];
}

/**
 * Validate a relationship type string
 */
export function isValidRelationshipType(type: string): type is RelationshipType {
  return getRelationshipTypes().includes(type as RelationshipType);
}
