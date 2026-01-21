/**
 * Reranker Module for Semantic RAG
 * Scores and selects top results based on multiple signals
 */

import { ContactFilteredResult } from './semantic-queries.js';

/**
 * Reranking weights configuration
 */
export interface RerankWeights {
  similarity: number;
  recency: number;
  frequency: number;
  entityPriority: number;
}

/**
 * Reranking options
 */
export interface RerankOptions {
  weights?: Partial<RerankWeights>;
  maxResults?: number;
  minScore?: number;
  scoreDrop?: number;
}

/**
 * Reranked result with computed final score
 */
export interface RankedResult extends ContactFilteredResult {
  finalScore: number;
  scoreBreakdown: {
    similarityComponent: number;
    recencyComponent: number;
    frequencyComponent: number;
    entityPriorityComponent: number;
  };
}

/**
 * Entity type priorities for scoring
 */
const ENTITY_PRIORITIES: Record<string, number> = {
  Person: 1.0,
  Topic: 0.9,
  Event: 0.85,
  Company: 0.8,
};

/**
 * Default reranking weights
 * Based on plan: (similarity × 0.5) + (recency × 0.25) + (frequency × 0.15) + (entityPriority × 0.1)
 */
const DEFAULT_WEIGHTS: RerankWeights = {
  similarity: 0.5,
  recency: 0.25,
  frequency: 0.15,
  entityPriority: 0.1,
};

/**
 * Default reranking options
 */
const DEFAULT_OPTIONS: Required<RerankOptions> = {
  weights: DEFAULT_WEIGHTS,
  maxResults: 10,
  minScore: 0.4,
  scoreDrop: 0.3, // Stop if score drops more than 30% from previous
};

/**
 * Calculate recency score (0-1)
 * 1 = mentioned today, decays over 30 days
 */
function calculateRecencyScore(lastMentioned?: number): number {
  if (!lastMentioned) {
    return 0.5; // Default for unknown recency
  }

  const now = Date.now();
  const daysSince = (now - lastMentioned) / (1000 * 60 * 60 * 24);
  const recency = 1 - daysSince / 30;

  // Clamp to 0-1
  return Math.max(0, Math.min(1, recency));
}

/**
 * Calculate frequency score (0-1)
 * Based on log scale of mention count
 */
function calculateFrequencyScore(times?: number): number {
  if (!times || times <= 0) {
    return 0;
  }

  // log10(times + 1) / 2, clamped to 0-1
  const frequency = Math.log10(times + 1) / 2;
  return Math.max(0, Math.min(1, frequency));
}

/**
 * Get entity priority score
 */
function getEntityPriority(entityType: string): number {
  return ENTITY_PRIORITIES[entityType] || 0.5;
}

/**
 * Rerank results using the scoring formula
 */
export function rerankResults(
  results: ContactFilteredResult[],
  entityType: 'Topic' | 'Person' | 'Event' | 'Company',
  options: RerankOptions = {}
): RankedResult[] {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    weights: { ...DEFAULT_WEIGHTS, ...options.weights },
  };

  const entityPriority = getEntityPriority(entityType);

  // Calculate final scores
  const ranked: RankedResult[] = results.map((result) => {
    const similarityComponent = result.score * opts.weights.similarity;
    const recencyComponent = calculateRecencyScore(result.lastMentioned) * opts.weights.recency;
    const frequencyComponent = calculateFrequencyScore(result.times) * opts.weights.frequency;
    const entityPriorityComponent = entityPriority * opts.weights.entityPriority;

    const finalScore =
      similarityComponent + recencyComponent + frequencyComponent + entityPriorityComponent;

    return {
      ...result,
      finalScore,
      scoreBreakdown: {
        similarityComponent,
        recencyComponent,
        frequencyComponent,
        entityPriorityComponent,
      },
    };
  });

  // Sort by final score descending
  ranked.sort((a, b) => b.finalScore - a.finalScore);

  return ranked;
}

/**
 * Select top results with dynamic cutoff
 * Stops when:
 * - maxResults reached
 * - score drops below minScore
 * - score drops more than scoreDrop% from previous
 */
export function selectTopResults(
  rankedResults: RankedResult[],
  options: RerankOptions = {}
): RankedResult[] {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (rankedResults.length === 0) {
    return [];
  }

  const selected: RankedResult[] = [];
  let previousScore = rankedResults[0]?.finalScore || 0;

  for (const result of rankedResults) {
    // Check max results
    if (selected.length >= opts.maxResults) {
      break;
    }

    // Check minimum score
    if (result.finalScore < opts.minScore) {
      break;
    }

    // Check score drop (skip for first result)
    if (selected.length > 0) {
      const dropRatio = (previousScore - result.finalScore) / previousScore;
      if (dropRatio > opts.scoreDrop) {
        console.log(
          `[Reranker] Score drop cutoff: ${result.finalScore.toFixed(3)} is ${(dropRatio * 100).toFixed(1)}% below previous`
        );
        break;
      }
    }

    selected.push(result);
    previousScore = result.finalScore;
  }

  return selected;
}

/**
 * Rerank and select top results in one operation
 */
export function rerankAndSelect(
  results: ContactFilteredResult[],
  entityType: 'Topic' | 'Person' | 'Event' | 'Company',
  options: RerankOptions = {}
): RankedResult[] {
  const ranked = rerankResults(results, entityType, options);
  return selectTopResults(ranked, options);
}

/**
 * Merge results from multiple entity types
 * Normalizes scores across different types
 */
export function mergeRankedResults(
  topics: RankedResult[],
  people: RankedResult[],
  events: RankedResult[],
  options: { maxTotal?: number } = {}
): RankedResult[] {
  const { maxTotal = 10 } = options;

  // Combine all results
  const all = [...topics, ...people, ...events];

  // Sort by final score
  all.sort((a, b) => b.finalScore - a.finalScore);

  // Return top results
  return all.slice(0, maxTotal);
}

/**
 * Log retrieval quality metrics
 */
export function logRetrievalStats(
  queryLength: number,
  topicCandidates: number,
  peopleCandidates: number,
  eventCandidates: number,
  topicFiltered: number,
  peopleFiltered: number,
  eventFiltered: number,
  finalResults: RankedResult[]
): void {
  console.log('[Semantic RAG] Stats:', {
    queryLength,
    candidates: {
      topics: topicCandidates,
      people: peopleCandidates,
      events: eventCandidates,
    },
    afterContactFilter: {
      topics: topicFiltered,
      people: peopleFiltered,
      events: eventFiltered,
    },
    finalResultCount: finalResults.length,
    topScores: finalResults.slice(0, 3).map((r) => ({
      name: r.name,
      score: r.finalScore.toFixed(3),
    })),
  });
}
