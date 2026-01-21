/**
 * Relationship Analyzer
 * Background analysis of accumulated relationship signals
 *
 * Processes signals from the orchestrator's real-time detection,
 * aggregates them over time, and updates FalkorDB when confidence thresholds are met.
 */

import { Redis } from 'ioredis';

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

export interface AccumulatedScores {
  colleague: number;
  client: number;
  manager: number;
  friend: number;
  acquaintance: number;
  family: number;
  romantic_partner: number;
  currentType: RelationshipType;
  currentConfidence: number;
  signalCount: number;
  lastUpdated: number;
}

export interface AnalysisResult {
  shouldUpdate: boolean;
  newType?: RelationshipType;
  newConfidence?: number;
  reason?: string;
}

// Redis key prefix for accumulated scores
const SCORES_KEY_PREFIX = 'RELATIONSHIP:scores:';

// Score decay factor (per day)
const DECAY_FACTOR_PER_DAY = 0.95;

// Update thresholds
const MIN_SCORE_DIFFERENCE = 0.3;
const MIN_SIGNAL_COUNT = 3;

// All relationship types for initialization
const ALL_TYPES: RelationshipType[] = [
  'colleague',
  'client',
  'manager',
  'friend',
  'acquaintance',
  'family',
  'romantic_partner',
];

/**
 * RelationshipAnalyzer handles background processing of relationship signals
 */
export class RelationshipAnalyzer {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Process a new relationship signal for a contact
   * Updates accumulated scores and determines if FalkorDB should be updated
   */
  async processSignal(
    contactId: string,
    signal: RelationshipSignal
  ): Promise<AnalysisResult> {
    // Get current scores
    let scores = await this.getScores(contactId);

    // Apply decay to all scores based on time since last update
    scores = this.applyDecay(scores);

    // Add new signal to accumulated scores
    scores = this.addSignal(scores, signal);

    // Save updated scores
    await this.saveScores(contactId, scores);

    // Determine if we should update FalkorDB
    return this.analyzeScores(scores);
  }

  /**
   * Get accumulated scores for a contact
   */
  async getScores(contactId: string): Promise<AccumulatedScores> {
    const scoresKey = `${SCORES_KEY_PREFIX}${contactId}`;
    const data = await this.redis.hgetall(scoresKey);

    if (!data || Object.keys(data).length === 0) {
      // Return default scores for new contact
      return this.getDefaultScores();
    }

    return {
      colleague: parseFloat(data['colleague'] || '0'),
      client: parseFloat(data['client'] || '0'),
      manager: parseFloat(data['manager'] || '0'),
      friend: parseFloat(data['friend'] || '0'),
      acquaintance: parseFloat(data['acquaintance'] || '0'),
      family: parseFloat(data['family'] || '0'),
      romantic_partner: parseFloat(data['romantic_partner'] || '0'),
      currentType: (data['currentType'] as RelationshipType) || 'acquaintance',
      currentConfidence: parseFloat(data['currentConfidence'] || '0'),
      signalCount: parseInt(data['signalCount'] || '0', 10),
      lastUpdated: parseInt(data['lastUpdated'] || '0', 10),
    };
  }

  /**
   * Get default scores for a new contact
   */
  private getDefaultScores(): AccumulatedScores {
    return {
      colleague: 0,
      client: 0,
      manager: 0,
      friend: 0,
      acquaintance: 0.5, // Slight bias toward acquaintance as default
      family: 0,
      romantic_partner: 0,
      currentType: 'acquaintance',
      currentConfidence: 0,
      signalCount: 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Apply time-based decay to all scores
   */
  private applyDecay(scores: AccumulatedScores): AccumulatedScores {
    if (scores.lastUpdated === 0) {
      return scores;
    }

    const daysSinceUpdate = (Date.now() - scores.lastUpdated) / (1000 * 60 * 60 * 24);
    const decayMultiplier = Math.pow(DECAY_FACTOR_PER_DAY, daysSinceUpdate);

    return {
      ...scores,
      colleague: scores.colleague * decayMultiplier,
      client: scores.client * decayMultiplier,
      manager: scores.manager * decayMultiplier,
      friend: scores.friend * decayMultiplier,
      acquaintance: scores.acquaintance * decayMultiplier,
      family: scores.family * decayMultiplier,
      romantic_partner: scores.romantic_partner * decayMultiplier,
    };
  }

  /**
   * Add a new signal to accumulated scores
   */
  private addSignal(
    scores: AccumulatedScores,
    signal: RelationshipSignal
  ): AccumulatedScores {
    const newScores = { ...scores };

    // Add weighted signal to the detected type
    // Weight is based on confidence
    newScores[signal.type] += signal.confidence;
    newScores.signalCount += 1;
    newScores.lastUpdated = Date.now();

    return newScores;
  }

  /**
   * Save scores to Redis
   */
  private async saveScores(
    contactId: string,
    scores: AccumulatedScores
  ): Promise<void> {
    const scoresKey = `${SCORES_KEY_PREFIX}${contactId}`;

    await this.redis.hset(scoresKey, {
      colleague: scores.colleague.toString(),
      client: scores.client.toString(),
      manager: scores.manager.toString(),
      friend: scores.friend.toString(),
      acquaintance: scores.acquaintance.toString(),
      family: scores.family.toString(),
      romantic_partner: scores.romantic_partner.toString(),
      currentType: scores.currentType,
      currentConfidence: scores.currentConfidence.toString(),
      signalCount: scores.signalCount.toString(),
      lastUpdated: scores.lastUpdated.toString(),
    });

    // Set 90-day TTL
    await this.redis.expire(scoresKey, 90 * 24 * 60 * 60);
  }

  /**
   * Analyze accumulated scores and determine if FalkorDB should be updated
   */
  private analyzeScores(scores: AccumulatedScores): AnalysisResult {
    // Find the type with highest score
    let maxType: RelationshipType = 'acquaintance';
    let maxScore = 0;
    let totalScore = 0;

    for (const type of ALL_TYPES) {
      const score = scores[type];
      totalScore += score;
      if (score > maxScore) {
        maxScore = score;
        maxType = type;
      }
    }

    // Calculate confidence as proportion of total
    const newConfidence = totalScore > 0 ? maxScore / totalScore : 0;

    // Check if update is warranted
    // Rule 1: Never auto-downgrade from family/friend to acquaintance
    const wouldDowngrade =
      (scores.currentType === 'family' || scores.currentType === 'friend') &&
      maxType === 'acquaintance';

    if (wouldDowngrade) {
      console.log(
        `[RelationshipAnalyzer] Skipping downgrade from ${scores.currentType} to acquaintance`
      );
      return {
        shouldUpdate: false,
        reason: 'auto_downgrade_prevented',
      };
    }

    // Rule 2: Need sufficient signal count
    if (scores.signalCount < MIN_SIGNAL_COUNT) {
      return {
        shouldUpdate: false,
        reason: `insufficient_signals (${scores.signalCount}/${MIN_SIGNAL_COUNT})`,
      };
    }

    // Rule 3: Need significant score difference from current
    const scoreDifference = newConfidence - scores.currentConfidence;
    const typeChanged = maxType !== scores.currentType;

    if (typeChanged && scoreDifference >= MIN_SCORE_DIFFERENCE) {
      console.log(
        `[RelationshipAnalyzer] Update warranted: ${scores.currentType} -> ${maxType} ` +
          `(confidence: ${Math.round(scores.currentConfidence * 100)}% -> ${Math.round(newConfidence * 100)}%)`
      );
      return {
        shouldUpdate: true,
        newType: maxType,
        newConfidence,
        reason: 'type_changed_with_sufficient_confidence',
      };
    }

    // Rule 4: Same type but significantly higher confidence
    if (!typeChanged && scoreDifference >= MIN_SCORE_DIFFERENCE) {
      console.log(
        `[RelationshipAnalyzer] Confidence update: ${maxType} ` +
          `(${Math.round(scores.currentConfidence * 100)}% -> ${Math.round(newConfidence * 100)}%)`
      );
      return {
        shouldUpdate: true,
        newType: maxType,
        newConfidence,
        reason: 'confidence_improved',
      };
    }

    return {
      shouldUpdate: false,
      reason: 'threshold_not_met',
    };
  }

  /**
   * Update the current type after FalkorDB has been updated
   */
  async markAsUpdated(
    contactId: string,
    newType: RelationshipType,
    newConfidence: number
  ): Promise<void> {
    const scoresKey = `${SCORES_KEY_PREFIX}${contactId}`;

    await this.redis.hset(scoresKey, {
      currentType: newType,
      currentConfidence: newConfidence.toString(),
    });

    console.log(
      `[RelationshipAnalyzer] Marked ${contactId} as updated: ${newType} (${Math.round(newConfidence * 100)}%)`
    );
  }

  /**
   * Check if a contact has manual override (prevents auto-updates)
   */
  async hasManualOverride(contactId: string): Promise<boolean> {
    const key = `RELATIONSHIP:manual_override:${contactId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Set manual override for a contact (called from dashboard)
   */
  async setManualOverride(contactId: string): Promise<void> {
    const key = `RELATIONSHIP:manual_override:${contactId}`;
    await this.redis.set(key, '1');
    console.log(`[RelationshipAnalyzer] Manual override set for ${contactId}`);
  }

  /**
   * Clear manual override for a contact
   */
  async clearManualOverride(contactId: string): Promise<void> {
    const key = `RELATIONSHIP:manual_override:${contactId}`;
    await this.redis.del(key);
    console.log(`[RelationshipAnalyzer] Manual override cleared for ${contactId}`);
  }
}
