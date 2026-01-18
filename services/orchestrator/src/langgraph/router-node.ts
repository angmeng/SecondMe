/**
 * Router Node - Haiku-based Message Classification
 * Classifies messages as phatic (simple acknowledgment) or substantive (requires context)
 * User Story 2: Enables conditional routing to skip graph retrieval for phatic messages
 */

import { haikuClient } from '../anthropic/haiku-client.js';
import { WorkflowState, MessageClassification } from './workflow.js';
import {
  extractRelationshipSignals,
  queueRelationshipSignal,
  isHighConfidenceSignal,
} from './relationship-signals.js';

/**
 * Router node - classifies incoming message using Haiku
 * Determines whether to retrieve graph context (substantive) or skip to simple response (phatic)
 */
export async function routerNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log(`[Router Node] Classifying message from ${state.contactId}...`);

  const startTime = Date.now();

  // Extract relationship signals from incoming message (fire-and-forget)
  // This adds <5ms latency since it's just regex matching
  const relationshipSignal = extractRelationshipSignals(state.content, false); // false = incoming message

  // Queue signal for background processing if detected (async, non-blocking)
  if (relationshipSignal) {
    queueRelationshipSignal(state.contactId, relationshipSignal, state.messageId);
  }

  // Only include high-confidence signals in the state for immediate use
  const highConfidenceSignal = isHighConfidenceSignal(relationshipSignal) ? relationshipSignal : undefined;

  try {
    // Quick heuristics for obvious phatic messages
    const quickClassification = quickClassify(state.content);
    if (quickClassification) {
      console.log(`[Router Node] Quick classification: ${quickClassification}`);
      return {
        classification: quickClassification,
        classificationLatency: Date.now() - startTime,
        classificationTokens: 0,
        ...(highConfidenceSignal && { relationshipSignal: highConfidenceSignal }),
      };
    }

    // Use Haiku for more complex classification
    const classification = await haikuClient.classifyMessage(state.content);
    const latency = Date.now() - startTime;

    console.log(`[Router Node] Classification: ${classification} (${latency}ms)`);

    return {
      classification,
      classificationLatency: latency,
      ...(highConfidenceSignal && { relationshipSignal: highConfidenceSignal }),
    };
  } catch (error: any) {
    console.error('[Router Node] Classification error:', error);
    // Default to substantive on error (safer to retrieve context than skip it)
    return {
      classification: 'substantive',
      classificationLatency: Date.now() - startTime,
      error: error.message || 'Classification failed',
      ...(highConfidenceSignal && { relationshipSignal: highConfidenceSignal }),
    };
  }
}

/**
 * Quick heuristic classification for obvious phatic messages
 * Saves API calls for common acknowledgments
 */
function quickClassify(content: string): MessageClassification | null {
  const normalized = content.toLowerCase().trim();

  // Single emoji or emoji-only messages
  if (/^[\p{Emoji}\s]+$/u.test(normalized) && normalized.length <= 10) {
    return 'phatic';
  }

  // Common phatic expressions (exact match)
  const phaticExact = [
    'ok', 'okay', 'k', 'kk', 'lol', 'haha', 'hahaha', 'lmao', 'lmfao',
    'yes', 'yeah', 'yep', 'yup', 'nope', 'no', 'nah',
    'thanks', 'thx', 'ty', 'thank you', 'thankyou',
    'hi', 'hey', 'hello', 'yo', 'sup', 'hiya',
    'bye', 'cya', 'later', 'goodnight', 'gn', 'good night',
    'cool', 'nice', 'great', 'awesome', 'perfect', 'sounds good',
    'sure', 'alright', 'aight', 'ight', 'bet',
    'np', 'no problem', 'no worries', 'nw',
    'omg', 'wow', 'whoa', 'damn', 'dang',
    'idk', 'idc', 'ikr', 'imo', 'tbh', 'ngl',
    'brb', 'gtg', 'g2g', 'ttyl',
  ];

  if (phaticExact.includes(normalized)) {
    return 'phatic';
  }

  // Very short messages (1-2 words) that don't contain question marks
  // and aren't obvious questions
  if (normalized.split(/\s+/).length <= 2 && !normalized.includes('?')) {
    // Check if it's not a substantive keyword
    const substantiveKeywords = [
      'what', 'when', 'where', 'why', 'how', 'who',
      'can', 'could', 'would', 'should', 'will',
      'did', 'do', 'does', 'have', 'has',
    ];

    const firstWord = normalized.split(/\s+/)[0] || '';
    if (firstWord && !substantiveKeywords.includes(firstWord)) {
      return 'phatic';
    }
  }

  // Messages with questions should be substantive
  if (normalized.includes('?')) {
    return 'substantive';
  }

  // Return null for messages that need Haiku classification
  return null;
}

/**
 * Routing decision function - determines next node based on classification
 */
export function routeByClassification(state: WorkflowState): string {
  if (state.error) {
    return 'end';
  }

  if (state.classification === 'phatic') {
    return 'phatic_response';
  }

  return 'graph_query';
}
