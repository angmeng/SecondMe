/**
 * Hybrid Retriever for Semantic RAG
 * Combines semantic vector search with keyword fallback
 * Provides graceful degradation when semantic search is unavailable
 */

import { embedMessage, isVoyageConfigured } from '../embeddings/index.js';
import {
  searchRelevantTopics,
  searchRelevantPeople,
  searchRelevantEvents,
  checkVectorIndexesExist,
} from './semantic-queries.js';
import {
  rerankAndSelect,
  mergeRankedResults,
  logRetrievalStats,
  RankedResult,
} from './reranker.js';
import {
  getContactContext,
  ContactContext,
  PersonContext,
  TopicContext,
  EventContext,
} from '../falkordb/queries.js';

/**
 * Semantic RAG configuration
 */
export interface SemanticRagConfig {
  enabled: boolean;
  retrieval: {
    topK: { topics: number; people: number; events: number };
    minScore: { topics: number; people: number; events: number };
  };
  reranking: {
    maxResults: number;
    minScore: number;
    scoreDrop: number;
  };
  fallbackThreshold: number; // Minimum results before triggering keyword fallback
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SemanticRagConfig = {
  enabled: process.env['SEMANTIC_RAG_ENABLED'] === 'true',
  retrieval: {
    topK: { topics: 10, people: 10, events: 5 },
    minScore: { topics: 0.7, people: 0.65, events: 0.7 },
  },
  reranking: {
    maxResults: 10,
    minScore: 0.4,
    scoreDrop: 0.3,
  },
  fallbackThreshold: 3,
};

/**
 * Retrieval result with metadata
 */
export interface SemanticRetrievalResult {
  context: ContactContext;
  method: 'semantic' | 'keyword' | 'hybrid' | 'legacy';
  latencyMs: number;
  stats?: {
    embeddingCached: boolean;
    topicCandidates: number;
    peopleCandidates: number;
    eventCandidates: number;
    tokensUsed: number;
  };
}

// Cache for vector index availability check
let vectorIndexesAvailable: boolean | null = null;
let vectorIndexCheckTime = 0;
const VECTOR_INDEX_CHECK_TTL = 60000; // 1 minute

/**
 * Check if semantic retrieval is available
 */
async function isSemanticAvailable(): Promise<boolean> {
  // Check feature flag
  if (!DEFAULT_CONFIG.enabled) {
    return false;
  }

  // Check Voyage API configuration
  if (!isVoyageConfigured()) {
    console.warn('[Hybrid Retriever] Voyage API not configured');
    return false;
  }

  // Check vector indexes (with caching)
  const now = Date.now();
  if (vectorIndexesAvailable === null || now - vectorIndexCheckTime > VECTOR_INDEX_CHECK_TTL) {
    vectorIndexesAvailable = await checkVectorIndexesExist();
    vectorIndexCheckTime = now;
  }

  return vectorIndexesAvailable;
}

/**
 * Convert ranked results to PersonContext format
 */
function rankedToPeopleContext(ranked: RankedResult[]): PersonContext[] {
  return ranked.map((r) => {
    const person: PersonContext = { name: r.name };
    if (r.occupation) person.occupation = r.occupation;
    if (r.company) person.company = r.company;
    if (r.industry) person.industry = r.industry;
    if (r.notes) person.notes = r.notes;
    if (r.lastMentioned) person.lastMentioned = r.lastMentioned;
    return person;
  });
}

/**
 * Convert ranked results to TopicContext format
 */
function rankedToTopicContext(ranked: RankedResult[]): TopicContext[] {
  return ranked.map((r) => {
    const topic: TopicContext = {
      name: r.name,
      times: r.times || 1,
      lastMentioned: r.lastMentioned || Date.now(),
    };
    if (r.category) topic.category = r.category;
    return topic;
  });
}

/**
 * Convert ranked results to EventContext format
 */
function rankedToEventContext(ranked: RankedResult[]): EventContext[] {
  return ranked.map((r) => {
    const event: EventContext = { name: r.name };
    if (r.date) event.date = r.date;
    if (r.description) event.description = r.description;
    return event;
  });
}

/**
 * Perform semantic retrieval with vector search
 */
async function semanticRetrieval(
  message: string,
  contactId: string,
  config: SemanticRagConfig
): Promise<{
  context: ContactContext;
  stats: SemanticRetrievalResult['stats'];
}> {
  // Step 1: Embed the message
  const embeddingResult = await embedMessage(message);
  const queryEmbedding = embeddingResult.embedding;

  // Step 2: Run parallel vector searches
  const [topicResults, peopleResults, eventResults] = await Promise.all([
    searchRelevantTopics(queryEmbedding, contactId, {
      topK: config.retrieval.topK.topics,
      minScore: config.retrieval.minScore.topics,
    }),
    searchRelevantPeople(queryEmbedding, contactId, {
      topK: config.retrieval.topK.people,
      minScore: config.retrieval.minScore.people,
    }),
    searchRelevantEvents(queryEmbedding, contactId, {
      topK: config.retrieval.topK.events,
      minScore: config.retrieval.minScore.events,
    }),
  ]);

  // Step 3: Rerank results
  const rankedTopics = rerankAndSelect(topicResults, 'Topic', {
    maxResults: config.reranking.maxResults,
    minScore: config.reranking.minScore,
    scoreDrop: config.reranking.scoreDrop,
  });

  const rankedPeople = rerankAndSelect(peopleResults, 'Person', {
    maxResults: config.reranking.maxResults,
    minScore: config.reranking.minScore,
    scoreDrop: config.reranking.scoreDrop,
  });

  const rankedEvents = rerankAndSelect(eventResults, 'Event', {
    maxResults: config.reranking.maxResults,
    minScore: config.reranking.minScore,
    scoreDrop: config.reranking.scoreDrop,
  });

  // Log retrieval stats
  const allRanked = mergeRankedResults(rankedTopics, rankedPeople, rankedEvents);
  logRetrievalStats(
    message.length,
    topicResults.length,
    peopleResults.length,
    eventResults.length,
    rankedTopics.length,
    rankedPeople.length,
    rankedEvents.length,
    allRanked
  );

  // Step 4: Convert to ContactContext format
  const context: ContactContext = {
    people: rankedToPeopleContext(rankedPeople),
    topics: rankedToTopicContext(rankedTopics),
    events: rankedToEventContext(rankedEvents),
  };

  return {
    context,
    stats: {
      embeddingCached: embeddingResult.fromCache,
      topicCandidates: topicResults.length,
      peopleCandidates: peopleResults.length,
      eventCandidates: eventResults.length,
      tokensUsed: embeddingResult.tokensUsed,
    },
  };
}

/**
 * Perform keyword-based fallback retrieval
 * Used when semantic search returns too few results
 */
async function keywordFallback(
  contactId: string,
  existingContext: ContactContext
): Promise<ContactContext> {
  console.log('[Hybrid Retriever] Running keyword fallback...');

  // Get full context from legacy queries
  const legacyContext = await getContactContext(contactId);

  // Merge with existing semantic results (semantic takes priority)
  const existingTopicNames = new Set(existingContext.topics.map((t) => t.name));
  const existingPeopleNames = new Set(existingContext.people.map((p) => p.name));
  const existingEventNames = new Set(existingContext.events.map((e) => e.name));

  // Add legacy results that aren't already in semantic results
  const mergedTopics = [
    ...existingContext.topics,
    ...legacyContext.topics.filter((t) => !existingTopicNames.has(t.name)),
  ];

  const mergedPeople = [
    ...existingContext.people,
    ...legacyContext.people.filter((p) => !existingPeopleNames.has(p.name)),
  ];

  const mergedEvents = [
    ...existingContext.events,
    ...legacyContext.events.filter((e) => !existingEventNames.has(e.name)),
  ];

  return {
    people: mergedPeople.slice(0, 10),
    topics: mergedTopics.slice(0, 8),
    events: mergedEvents.slice(0, 5),
  };
}

/**
 * Main hybrid retrieval function
 * Attempts semantic retrieval, falls back to keyword/legacy as needed
 */
export async function retrieveContext(
  message: string,
  contactId: string,
  config: Partial<SemanticRagConfig> = {}
): Promise<SemanticRetrievalResult> {
  const mergedConfig: SemanticRagConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    retrieval: { ...DEFAULT_CONFIG.retrieval, ...config.retrieval },
    reranking: { ...DEFAULT_CONFIG.reranking, ...config.reranking },
  };

  const startTime = Date.now();

  // Check if semantic retrieval is available
  const semanticAvailable = await isSemanticAvailable();

  if (!semanticAvailable) {
    // Fall back to legacy retrieval
    console.log('[Hybrid Retriever] Semantic not available, using legacy retrieval');
    const context = await getContactContext(contactId);
    return {
      context,
      method: 'legacy',
      latencyMs: Date.now() - startTime,
    };
  }

  try {
    // Attempt semantic retrieval
    const { context, stats } = await semanticRetrieval(message, contactId, mergedConfig);

    // Check if we have enough results
    const totalResults = context.people.length + context.topics.length + context.events.length;

    if (totalResults < mergedConfig.fallbackThreshold) {
      // Not enough results, augment with keyword fallback
      console.log(
        `[Hybrid Retriever] Only ${totalResults} results, augmenting with keyword fallback`
      );
      const hybridContext = await keywordFallback(contactId, context);
      const result: SemanticRetrievalResult = {
        context: hybridContext,
        method: 'hybrid',
        latencyMs: Date.now() - startTime,
      };
      if (stats) result.stats = stats;
      return result;
    }

    const result: SemanticRetrievalResult = {
      context,
      method: 'semantic',
      latencyMs: Date.now() - startTime,
    };
    if (stats) result.stats = stats;
    return result;
  } catch (error) {
    // On any error, fall back to legacy
    console.error('[Hybrid Retriever] Semantic retrieval failed, using legacy:', error);
    const context = await getContactContext(contactId);
    return {
      context,
      method: 'legacy',
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Get current configuration
 */
export function getSemanticRagConfig(): SemanticRagConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Check if semantic RAG is enabled
 */
export function isSemanticRagEnabled(): boolean {
  return DEFAULT_CONFIG.enabled;
}

/**
 * Force refresh of vector index availability check
 */
export function refreshVectorIndexCheck(): void {
  vectorIndexesAvailable = null;
  vectorIndexCheckTime = 0;
}
