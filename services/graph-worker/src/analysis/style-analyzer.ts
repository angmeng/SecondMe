/**
 * Style Analyzer
 * Analyzes user's outgoing messages to build per-contact style profiles
 *
 * Follows the same pattern as RelationshipAnalyzer:
 * - Accumulates signals in Redis (fast, real-time)
 * - Updates FalkorDB when conditions are met (batch, durable)
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
} from './style-profile.js';
import { updateContactStyleProfile } from '../falkordb/mutations.js';

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

    // Check if we should update FalkorDB
    await this.maybeUpdateProfile(contactId, data);
  }

  /**
   * Check if profile should be updated in FalkorDB
   */
  private async maybeUpdateProfile(
    contactId: string,
    data: AccumulatedStyleData
  ): Promise<void> {
    // Check minimum samples
    if (data.sampleCount < STYLE_CONFIG.minMessagesForProfile) {
      console.log(
        `[Style Analyzer] ${contactId}: ${data.sampleCount}/${STYLE_CONFIG.minMessagesForProfile} samples, not enough for profile`
      );
      return;
    }

    // Check pending count
    const pendingCount = parseInt((await this.redis.get(this.getPendingKey(contactId))) || '0', 10);
    if (pendingCount < STYLE_CONFIG.updateThreshold) {
      return;
    }

    console.log(`[Style Analyzer] Updating FalkorDB profile for ${contactId} (${pendingCount} pending changes)`);

    // Compute profile
    const profile = computeStyleProfile(contactId, data);

    // Update FalkorDB
    try {
      await updateContactStyleProfile(contactId, profile);

      // Reset pending count
      await this.redis.del(this.getPendingKey(contactId));

      console.log(
        `[Style Analyzer] Profile updated for ${contactId}: ` +
          `avgLen=${Math.round(profile.avgMessageLength)}, emoji=${profile.emojiFrequency.toFixed(2)}, ` +
          `formality=${profile.formalityScore.toFixed(2)}, samples=${profile.sampleCount}`
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
   * Force update profile to FalkorDB (for manual triggers)
   */
  async forceUpdateProfile(contactId: string): Promise<StyleProfile | null> {
    const data = await this.getAccumulatedData(contactId);

    if (data.sampleCount < STYLE_CONFIG.minMessagesForProfile) {
      console.log(`[Style Analyzer] Cannot force update ${contactId}: insufficient samples`);
      return null;
    }

    const profile = computeStyleProfile(contactId, data);
    await updateContactStyleProfile(contactId, profile);
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
   * Get stats for debugging
   */
  async getStats(contactId: string): Promise<{
    sampleCount: number;
    pendingUpdates: number;
    hasProfile: boolean;
  }> {
    const data = await this.getAccumulatedData(contactId);
    const pending = parseInt((await this.redis.get(this.getPendingKey(contactId))) || '0', 10);

    return {
      sampleCount: data.sampleCount,
      pendingUpdates: pending,
      hasProfile: data.sampleCount >= STYLE_CONFIG.minMessagesForProfile,
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
