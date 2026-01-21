/**
 * Style Analyzer
 * Analyzes user's outgoing messages to build per-contact style profiles
 *
 * Follows the same pattern as RelationshipAnalyzer:
 * - Accumulates signals in Redis (fast, real-time)
 * - Updates AutoMem when conditions are met (batch, durable)
 */

import { Redis } from 'ioredis';
import {
  StyleProfile,
  AccumulatedStyleData,
  STYLE_CONFIG,
  calculateEmojiCount,
  calculateFormalityScore,
  extractGreeting,
  extractSignOff,
  analyzePunctuation,
  createEmptyAccumulatedData,
  computeStyleProfile,
  serializeAccumulatedData,
  deserializeAccumulatedData,
  calculateConfidence,
  getConfidenceDescription,
} from './style-profile.js';
import { updateStyleProfile } from '../automem/index.js';

// Redis key prefix for style data
const STYLE_DATA_KEY_PREFIX = 'STYLE:data:';
const STYLE_PENDING_KEY_PREFIX = 'STYLE:pending:';

/**
 * StyleAnalyzer handles analysis of outgoing messages for style profiling
 */
export class StyleAnalyzer {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Get Redis key for accumulated style data
   */
  private getDataKey(contactId: string): string {
    return `${STYLE_DATA_KEY_PREFIX}${contactId}`;
  }

  /**
   * Get Redis key for pending update count
   */
  private getPendingKey(contactId: string): string {
    return `${STYLE_PENDING_KEY_PREFIX}${contactId}`;
  }

  /**
   * Analyze an outgoing message and update style data
   * Called when fromMe=true messages are detected
   */
  async analyzeOutgoingMessage(contactId: string, text: string): Promise<void> {
    if (!text || text.trim().length === 0) {
      return;
    }

    console.log(`[Style Analyzer] Analyzing message for ${contactId}: "${text.slice(0, 50)}..."`);

    // Get or create accumulated data
    let data = await this.getAccumulatedData(contactId);

    // Analyze message
    const messageLength = text.length;
    const emojiCount = calculateEmojiCount(text);
    const formalityScore = calculateFormalityScore(text);
    const punctuation = analyzePunctuation(text);
    const greeting = extractGreeting(text);
    const signOff = extractSignOff(text);

    // Update accumulated data
    data.messageLengths.push(messageLength);
    data.emojiCounts.push(emojiCount);
    data.formalityScores.push(formalityScore);

    // Keep arrays bounded
    if (data.messageLengths.length > STYLE_CONFIG.maxStoredSamples) {
      data.messageLengths.shift();
    }
    if (data.emojiCounts.length > STYLE_CONFIG.maxStoredSamples) {
      data.emojiCounts.shift();
    }
    if (data.formalityScores.length > STYLE_CONFIG.maxStoredSamples) {
      data.formalityScores.shift();
    }

    // Update punctuation data
    if (punctuation.hasEllipsis) data.punctuationData.ellipsisCount++;
    data.punctuationData.exclamationCount += punctuation.exclamationCount;
    data.punctuationData.questionCount += punctuation.questionCount;
    if (punctuation.endsWithPeriod) data.punctuationData.periodEndCount++;

    // Update greeting/sign-off frequencies
    if (greeting) {
      const current = data.greetings.get(greeting) || 0;
      data.greetings.set(greeting, current + 1);
    }
    if (signOff) {
      const current = data.signOffs.get(signOff) || 0;
      data.signOffs.set(signOff, current + 1);
    }

    data.sampleCount++;
    data.lastUpdated = Date.now();

    // Save accumulated data
    await this.saveAccumulatedData(contactId, data);

    // Increment pending count
    await this.redis.incr(this.getPendingKey(contactId));

    // Check if we should update AutoMem
    await this.maybeUpdateProfile(contactId, data);
  }

  /**
   * Get tiered progress string showing progress toward each confidence level
   */
  private getTieredProgressString(sampleCount: number): string {
    const { thresholds } = STYLE_CONFIG;
    const parts: string[] = [];

    if (sampleCount < thresholds.basicMetrics) {
      parts.push(`basic: ${sampleCount}/${thresholds.basicMetrics}`);
    } else if (sampleCount < thresholds.punctuation) {
      parts.push(`basic: done`);
      parts.push(`punctuation: ${sampleCount}/${thresholds.punctuation}`);
    } else if (sampleCount < thresholds.greetingsSignOffs) {
      parts.push(`basic: done`);
      parts.push(`punctuation: done`);
      parts.push(`greetings: ${sampleCount}/${thresholds.greetingsSignOffs}`);
    } else {
      parts.push(`all tiers complete (${sampleCount} samples)`);
    }

    return parts.join(', ');
  }

  /**
   * Check if profile should be updated in AutoMem
   */
  private async maybeUpdateProfile(
    contactId: string,
    data: AccumulatedStyleData
  ): Promise<void> {
    const progressStr = this.getTieredProgressString(data.sampleCount);

    // Check minimum samples
    if (data.sampleCount < STYLE_CONFIG.minMessagesForProfile) {
      console.log(
        `[Style Analyzer] ${contactId}: not enough for profile (${progressStr})`
      );
      return;
    }

    // Check pending count
    const pendingCount = parseInt((await this.redis.get(this.getPendingKey(contactId))) || '0', 10);
    if (pendingCount < STYLE_CONFIG.updateThreshold) {
      return;
    }

    // Compute profile
    const profile = computeStyleProfile(contactId, data);
    const confidenceDesc = getConfidenceDescription(profile.confidence);

    console.log(
      `[Style Analyzer] Updating AutoMem profile for ${contactId} ` +
        `(${pendingCount} pending, confidence: ${profile.confidence})`
    );

    // Update AutoMem
    try {
      await updateStyleProfile(contactId, profile);

      // Reset pending count
      await this.redis.del(this.getPendingKey(contactId));

      console.log(
        `[Style Analyzer] Profile updated for ${contactId}: ` +
          `confidence=${profile.confidence}, avgLen=${Math.round(profile.avgMessageLength)}, ` +
          `emoji=${profile.emojiFrequency.toFixed(2)}, formality=${profile.formalityScore.toFixed(2)}, ` +
          `samples=${profile.sampleCount} (${confidenceDesc})`
      );
    } catch (error) {
      console.error(`[Style Analyzer] Failed to update profile for ${contactId}:`, error);
    }
  }

  /**
   * Get accumulated style data from Redis
   */
  private async getAccumulatedData(contactId: string): Promise<AccumulatedStyleData> {
    const key = this.getDataKey(contactId);
    const stored = await this.redis.get(key);

    if (stored) {
      try {
        return deserializeAccumulatedData(stored);
      } catch (error) {
        console.warn(`[Style Analyzer] Failed to deserialize data for ${contactId}:`, error);
      }
    }

    return createEmptyAccumulatedData();
  }

  /**
   * Save accumulated style data to Redis
   */
  private async saveAccumulatedData(
    contactId: string,
    data: AccumulatedStyleData
  ): Promise<void> {
    const key = this.getDataKey(contactId);
    const serialized = serializeAccumulatedData(data);
    await this.redis.setex(key, STYLE_CONFIG.redisTTL, serialized);
  }

  /**
   * Get current style profile (computed from accumulated data)
   * Returns null if not enough samples
   */
  async getStyleProfile(contactId: string): Promise<StyleProfile | null> {
    const data = await this.getAccumulatedData(contactId);

    if (data.sampleCount < STYLE_CONFIG.minMessagesForProfile) {
      return null;
    }

    return computeStyleProfile(contactId, data);
  }

  /**
   * Force update profile to AutoMem (for manual triggers)
   */
  async forceUpdateProfile(contactId: string): Promise<StyleProfile | null> {
    const data = await this.getAccumulatedData(contactId);

    if (data.sampleCount < STYLE_CONFIG.minMessagesForProfile) {
      console.log(`[Style Analyzer] Cannot force update ${contactId}: insufficient samples`);
      return null;
    }

    const profile = computeStyleProfile(contactId, data);
    await updateStyleProfile(contactId, profile);
    await this.redis.del(this.getPendingKey(contactId));

    return profile;
  }

  /**
   * Clear style data for a contact (for testing or reset)
   */
  async clearStyleData(contactId: string): Promise<void> {
    await this.redis.del(this.getDataKey(contactId));
    await this.redis.del(this.getPendingKey(contactId));
    console.log(`[Style Analyzer] Cleared style data for ${contactId}`);
  }

  /**
   * Get stats for debugging, including confidence levels
   */
  async getStats(contactId: string): Promise<{
    sampleCount: number;
    pendingUpdates: number;
    hasProfile: boolean;
    confidence: 'none' | 'low' | 'medium' | 'high';
    featureProgress: {
      basicMetrics: { current: number; required: number; complete: boolean };
      punctuation: { current: number; required: number; complete: boolean };
      greetingsSignOffs: { current: number; required: number; complete: boolean };
    };
  }> {
    const data = await this.getAccumulatedData(contactId);
    const pending = parseInt((await this.redis.get(this.getPendingKey(contactId))) || '0', 10);
    const { thresholds } = STYLE_CONFIG;
    const sampleCount = data.sampleCount;

    // Determine confidence level
    let confidence: 'none' | 'low' | 'medium' | 'high';
    if (sampleCount < thresholds.basicMetrics) {
      confidence = 'none';
    } else {
      confidence = calculateConfidence(sampleCount);
    }

    return {
      sampleCount,
      pendingUpdates: pending,
      hasProfile: sampleCount >= STYLE_CONFIG.minMessagesForProfile,
      confidence,
      featureProgress: {
        basicMetrics: {
          current: sampleCount,
          required: thresholds.basicMetrics,
          complete: sampleCount >= thresholds.basicMetrics,
        },
        punctuation: {
          current: sampleCount,
          required: thresholds.punctuation,
          complete: sampleCount >= thresholds.punctuation,
        },
        greetingsSignOffs: {
          current: sampleCount,
          required: thresholds.greetingsSignOffs,
          complete: sampleCount >= thresholds.greetingsSignOffs,
        },
      },
    };
  }
}

// Export singleton factory
let styleAnalyzerInstance: StyleAnalyzer | null = null;

export function getStyleAnalyzer(redis: Redis): StyleAnalyzer {
  if (!styleAnalyzerInstance) {
    styleAnalyzerInstance = new StyleAnalyzer(redis);
  }
  return styleAnalyzerInstance;
}
