/**
 * Hybrid Retriever for Semantic RAG
 * Combines semantic vector search with keyword fallback
 * Provides graceful degradation when semantic search is unavailable
 *
 * Uses AutoMem for both semantic search (via Qdrant) and graph retrieval
 */

import {
  getContactContext,
  searchRelevantContext,
  type ContactContext,
  type PersonContext,
  type TopicContext,
  type EventContext,
} from '../automem/recall.js';
import { automemClient } from '../automem/client.js';

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

// Cache for AutoMem availability check
let automemAvailableCache: boolean | null = null;
let automemCheckTime = 0;
const AUTOMEM_CHECK_TTL = 60000; // 1 minute

/**
 * Check if semantic retrieval is available
 * Uses AutoMem's internal Qdrant for vector search
 */
async function isSemanticAvailable(): Promise<boolean> {
  // Check feature flag
  if (!DEFAULT_CONFIG.enabled) {
    return false;
  }

  // Check AutoMem availability (with caching)
  const now = Date.now();
  if (automemAvailableCache === null || now - automemCheckTime > AUTOMEM_CHECK_TTL) {
    automemAvailableCache = automemClient.connected;
    automemCheckTime = now;
  }

  return automemAvailableCache;
}

/**
 * Perform semantic retrieval using AutoMem
 * AutoMem handles vector search via Qdrant internally
 */
async function semanticRetrieval(
  message: string,
  contactId: string,
  config: SemanticRagConfig
): Promise<{
  context: ContactContext;
  stats: SemanticRetrievalResult['stats'];
}> {
  // Use AutoMem's semantic search - it handles embedding and vector search internally
  const totalLimit =
    config.retrieval.topK.topics + config.retrieval.topK.people + config.retrieval.topK.events;

  const response = await searchRelevantContext(message, contactId, totalLimit);

  // Parse results into categorized context
  const people: PersonContext[] = [];
  const topics: TopicContext[] = [];
  const events: EventContext[] = [];

  for (const result of response.results) {
    try {
      const parsed = JSON.parse(result.memory.content) as Record<string, unknown>;
      const entityType = result.memory.metadata?.['entityType'] as string | undefined;

      if (entityType === 'person') {
        const person: PersonContext = { name: parsed['name'] as string };
        if (parsed['occupation']) person.occupation = parsed['occupation'] as string;
        if (parsed['company']) person.company = parsed['company'] as string;
        if (parsed['industry']) person.industry = parsed['industry'] as string;
        if (parsed['notes']) person.notes = parsed['notes'] as string;
        if (result.memory.timestamp) {
          person.lastMentioned = new Date(result.memory.timestamp).getTime();
        }
        people.push(person);
      } else if (entityType === 'topic') {
        const topic: TopicContext = {
          name: parsed['name'] as string,
          times: (parsed['mentionCount'] as number) || 1,
          lastMentioned: (parsed['lastMentioned'] as number) || Date.now(),
        };
        if (parsed['category']) topic.category = parsed['category'] as string;
        topics.push(topic);
      } else if (entityType === 'event') {
        const event: EventContext = { name: parsed['name'] as string };
        if (parsed['date']) event.date = parsed['date'] as string;
        if (parsed['description']) event.description = parsed['description'] as string;
        events.push(event);
      }
    } catch {
      // Skip malformed results
      console.warn(`[Hybrid Retriever] Failed to parse memory: ${result.id}`);
    }
  }

  // Log retrieval stats
  console.log(
    `[Hybrid Retriever] AutoMem semantic search returned ${response.results.length} results: ` +
      `${people.length} people, ${topics.length} topics, ${events.length} events`
  );

  const context: ContactContext = {
    people: people.slice(0, config.retrieval.topK.people),
    topics: topics.slice(0, config.retrieval.topK.topics),
    events: events.slice(0, config.retrieval.topK.events),
  };

  return {
    context,
    stats: {
      embeddingCached: false, // AutoMem handles embedding internally
      topicCandidates: topics.length,
      peopleCandidates: people.length,
      eventCandidates: events.length,
      tokensUsed: 0, // Not tracked when using AutoMem
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
 * Force refresh of AutoMem availability check
 */
export function refreshAutomemCheck(): void {
  automemAvailableCache = null;
  automemCheckTime = 0;
}
