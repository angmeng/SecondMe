/**
 * Retrieval Fusion Module
 * Task 5.1.3: Combines multiple retrieval methods for better recall
 *
 * Fusion Strategy:
 * 1. Run keyword search on conversation history
 * 2. Run semantic search on AutoMem
 * 3. Query knowledge graph for entity relationships
 * 4. Merge and re-rank results with configurable weights
 * 5. Apply token budget
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
import { historyCache, type ConversationMessage } from '../history/index.js';
import { extractKeywords } from '../history/keyword-chunker.js';

/**
 * Retrieval source types
 */
export type RetrievalSource = 'semantic' | 'keyword' | 'graph' | 'history';

/**
 * Configuration for retrieval fusion
 */
export interface RetrievalFusionConfig {
  /** Enable/disable fusion (falls back to legacy if disabled) */
  enabled: boolean;
  /** Weights for each retrieval source (0-1, should sum to 1) */
  weights: {
    semantic: number;
    keyword: number;
    graph: number;
    history: number;
  };
  /** Maximum results per source before fusion */
  maxResultsPerSource: {
    topics: number;
    people: number;
    events: number;
  };
  /** Minimum score threshold for inclusion (0-1) */
  minScore: number;
  /** Token budget for context */
  tokenBudget: number;
  /** Estimated tokens per entity */
  tokensPerEntity: {
    topic: number;
    person: number;
    event: number;
    historyMessage: number;
  };
}

/**
 * Default fusion configuration
 */
const DEFAULT_CONFIG: RetrievalFusionConfig = {
  enabled: process.env['RETRIEVAL_FUSION_ENABLED'] === 'true',
  weights: {
    semantic: 0.4, // Semantic search from AutoMem
    keyword: 0.2, // Keyword-based fallback
    graph: 0.3, // Knowledge graph relationships
    history: 0.1, // Conversation history context
  },
  maxResultsPerSource: {
    topics: 8,
    people: 10,
    events: 5,
  },
  minScore: 0.3,
  tokenBudget: 2000,
  tokensPerEntity: {
    topic: 30,
    person: 50,
    event: 40,
    historyMessage: 20,
  },
};

/**
 * Scored result item for ranking
 */
interface ScoredItem<T> {
  item: T;
  score: number;
  sources: RetrievalSource[];
}

/**
 * Fused retrieval result
 */
export interface FusionResult {
  context: ContactContext;
  conversationHistory: ConversationMessage[];
  historyMessageCount: number;
  method: 'fusion' | 'semantic' | 'keyword' | 'legacy';
  latencyMs: number;
  stats: {
    semanticResults: number;
    keywordResults: number;
    graphResults: number;
    historyMessages: number;
    totalBefore: number;
    totalAfter: number;
    tokenEstimate: number;
    sourcesUsed: RetrievalSource[];
  };
}

/**
 * Retrieval Fusion class
 * Combines multiple retrieval sources with configurable weights
 */
export class RetrievalFusion {
  private config: RetrievalFusionConfig;

  constructor(config: Partial<RetrievalFusionConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_CONFIG.weights, ...config.weights },
      maxResultsPerSource: { ...DEFAULT_CONFIG.maxResultsPerSource, ...config.maxResultsPerSource },
      tokensPerEntity: { ...DEFAULT_CONFIG.tokensPerEntity, ...config.tokensPerEntity },
    };
  }

  /**
   * Check if fusion is available
   */
  isEnabled(): boolean {
    return this.config.enabled && automemClient.connected;
  }

  /**
   * Perform fused retrieval
   */
  async retrieve(
    message: string,
    contactId: string
  ): Promise<FusionResult> {
    const startTime = Date.now();

    if (!this.isEnabled()) {
      // Fall back to legacy retrieval
      const context = await getContactContext(contactId);
      const historyResult = await historyCache.getRecentHistory(contactId);

      return {
        context,
        conversationHistory: historyResult.messages,
        historyMessageCount: historyResult.messageCount,
        method: 'legacy',
        latencyMs: Date.now() - startTime,
        stats: {
          semanticResults: 0,
          keywordResults: 0,
          graphResults: context.people.length + context.topics.length + context.events.length,
          historyMessages: historyResult.messageCount,
          totalBefore: 0,
          totalAfter: 0,
          tokenEstimate: 0,
          sourcesUsed: ['graph'],
        },
      };
    }

    // Run all retrieval sources in parallel
    const [semanticResult, keywordResult, graphResult, historyResult] = await Promise.all([
      this.semanticRetrieval(message, contactId),
      this.keywordRetrieval(message, contactId),
      this.graphRetrieval(contactId),
      historyCache.getRecentHistory(contactId),
    ]);

    // Merge and score results
    const fusedTopics = this.fuseResults(
      semanticResult.topics,
      keywordResult.topics,
      graphResult.topics,
      'name'
    );
    const fusedPeople = this.fuseResults(
      semanticResult.people,
      keywordResult.people,
      graphResult.people,
      'name'
    );
    const fusedEvents = this.fuseResults(
      semanticResult.events,
      keywordResult.events,
      graphResult.events,
      'name'
    );

    // Re-rank and deduplicate
    const rankedTopics = this.rankAndDeduplicate(fusedTopics);
    const rankedPeople = this.rankAndDeduplicate(fusedPeople);
    const rankedEvents = this.rankAndDeduplicate(fusedEvents);

    // Apply token budget
    const { topics, people, events, tokenEstimate } = this.applyTokenBudget(
      rankedTopics,
      rankedPeople,
      rankedEvents,
      historyResult.messageCount
    );

    const totalBefore =
      semanticResult.topics.length + semanticResult.people.length + semanticResult.events.length +
      keywordResult.topics.length + keywordResult.people.length + keywordResult.events.length +
      graphResult.topics.length + graphResult.people.length + graphResult.events.length;

    const totalAfter = topics.length + people.length + events.length;

    const sourcesUsed: RetrievalSource[] = [];
    if (semanticResult.topics.length + semanticResult.people.length + semanticResult.events.length > 0) {
      sourcesUsed.push('semantic');
    }
    if (keywordResult.topics.length + keywordResult.people.length + keywordResult.events.length > 0) {
      sourcesUsed.push('keyword');
    }
    if (graphResult.topics.length + graphResult.people.length + graphResult.events.length > 0) {
      sourcesUsed.push('graph');
    }
    if (historyResult.messageCount > 0) {
      sourcesUsed.push('history');
    }

    console.log(
      `[Retrieval Fusion] Fused ${totalBefore} -> ${totalAfter} results from ${sourcesUsed.join(', ')}`
    );

    return {
      context: { topics, people, events },
      conversationHistory: historyResult.messages,
      historyMessageCount: historyResult.messageCount,
      method: 'fusion',
      latencyMs: Date.now() - startTime,
      stats: {
        semanticResults: semanticResult.topics.length + semanticResult.people.length + semanticResult.events.length,
        keywordResults: keywordResult.topics.length + keywordResult.people.length + keywordResult.events.length,
        graphResults: graphResult.topics.length + graphResult.people.length + graphResult.events.length,
        historyMessages: historyResult.messageCount,
        totalBefore,
        totalAfter,
        tokenEstimate,
        sourcesUsed,
      },
    };
  }

  /**
   * Semantic retrieval using AutoMem
   */
  private async semanticRetrieval(
    message: string,
    contactId: string
  ): Promise<ContactContext> {
    try {
      const totalLimit =
        this.config.maxResultsPerSource.topics +
        this.config.maxResultsPerSource.people +
        this.config.maxResultsPerSource.events;

      const response = await searchRelevantContext(message, contactId, totalLimit);

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
            if (parsed['notes']) person.notes = parsed['notes'] as string;
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
        }
      }

      return { people, topics, events };
    } catch (error) {
      console.warn('[Retrieval Fusion] Semantic retrieval failed:', error);
      return { people: [], topics: [], events: [] };
    }
  }

  /**
   * Keyword-based retrieval using message content analysis
   */
  private async keywordRetrieval(
    message: string,
    contactId: string
  ): Promise<ContactContext> {
    try {
      // Extract keywords from the message
      const keywords = extractKeywords(message);

      if (keywords.size === 0) {
        return { people: [], topics: [], events: [] };
      }

      // Get full context and filter by keywords
      const fullContext = await getContactContext(contactId);

      // Score and filter by keyword match
      const keywordArray = Array.from(keywords);

      const scoredTopics = fullContext.topics.filter((topic) =>
        keywordArray.some((kw) =>
          topic.name.toLowerCase().includes(kw) ||
          (topic.category && topic.category.toLowerCase().includes(kw))
        )
      );

      const scoredPeople = fullContext.people.filter((person) =>
        keywordArray.some((kw) =>
          person.name.toLowerCase().includes(kw) ||
          (person.occupation && person.occupation.toLowerCase().includes(kw)) ||
          (person.company && person.company.toLowerCase().includes(kw))
        )
      );

      const scoredEvents = fullContext.events.filter((event) =>
        keywordArray.some((kw) =>
          event.name.toLowerCase().includes(kw) ||
          (event.description && event.description.toLowerCase().includes(kw))
        )
      );

      return {
        people: scoredPeople.slice(0, this.config.maxResultsPerSource.people),
        topics: scoredTopics.slice(0, this.config.maxResultsPerSource.topics),
        events: scoredEvents.slice(0, this.config.maxResultsPerSource.events),
      };
    } catch (error) {
      console.warn('[Retrieval Fusion] Keyword retrieval failed:', error);
      return { people: [], topics: [], events: [] };
    }
  }

  /**
   * Graph-based retrieval for entity relationships
   */
  private async graphRetrieval(contactId: string): Promise<ContactContext> {
    try {
      const context = await getContactContext(contactId);

      return {
        people: context.people.slice(0, this.config.maxResultsPerSource.people),
        topics: context.topics.slice(0, this.config.maxResultsPerSource.topics),
        events: context.events.slice(0, this.config.maxResultsPerSource.events),
      };
    } catch (error) {
      console.warn('[Retrieval Fusion] Graph retrieval failed:', error);
      return { people: [], topics: [], events: [] };
    }
  }

  /**
   * Fuse results from multiple sources with scoring
   */
  private fuseResults<T extends { name: string }>(
    semantic: T[],
    keyword: T[],
    graph: T[],
    keyField: keyof T
  ): ScoredItem<T>[] {
    const merged = new Map<string, ScoredItem<T>>();

    // Process semantic results
    for (const item of semantic) {
      const key = String(item[keyField]).toLowerCase();
      const existing = merged.get(key);

      if (existing) {
        existing.score += this.config.weights.semantic;
        existing.sources.push('semantic');
      } else {
        merged.set(key, {
          item,
          score: this.config.weights.semantic,
          sources: ['semantic'],
        });
      }
    }

    // Process keyword results
    for (const item of keyword) {
      const key = String(item[keyField]).toLowerCase();
      const existing = merged.get(key);

      if (existing) {
        existing.score += this.config.weights.keyword;
        existing.sources.push('keyword');
      } else {
        merged.set(key, {
          item,
          score: this.config.weights.keyword,
          sources: ['keyword'],
        });
      }
    }

    // Process graph results
    for (const item of graph) {
      const key = String(item[keyField]).toLowerCase();
      const existing = merged.get(key);

      if (existing) {
        existing.score += this.config.weights.graph;
        existing.sources.push('graph');
      } else {
        merged.set(key, {
          item,
          score: this.config.weights.graph,
          sources: ['graph'],
        });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Rank and deduplicate results
   */
  private rankAndDeduplicate<T>(items: ScoredItem<T>[]): T[] {
    // Sort by score (descending) and filter by minimum score
    const ranked = items
      .filter((item) => item.score >= this.config.minScore)
      .sort((a, b) => b.score - a.score);

    // Return just the items (already deduplicated by the merge)
    return ranked.map((item) => item.item);
  }

  /**
   * Apply token budget to results
   */
  private applyTokenBudget(
    topics: TopicContext[],
    people: PersonContext[],
    events: EventContext[],
    historyMessageCount: number
  ): {
    topics: TopicContext[];
    people: PersonContext[];
    events: EventContext[];
    tokenEstimate: number;
  } {
    const { tokensPerEntity, tokenBudget } = this.config;

    // Reserve tokens for history
    const historyTokens = historyMessageCount * tokensPerEntity.historyMessage;
    const remainingBudget = tokenBudget - historyTokens;

    // Allocate remaining budget proportionally
    const topicTokens = topics.length * tokensPerEntity.topic;
    const personTokens = people.length * tokensPerEntity.person;
    const eventTokens = events.length * tokensPerEntity.event;
    const totalEntityTokens = topicTokens + personTokens + eventTokens;

    if (totalEntityTokens <= remainingBudget) {
      // Everything fits
      return {
        topics,
        people,
        events,
        tokenEstimate: historyTokens + totalEntityTokens,
      };
    }

    // Need to trim - prioritize proportionally
    const ratio = remainingBudget / totalEntityTokens;

    const maxTopics = Math.floor((topics.length * ratio) + 0.5);
    const maxPeople = Math.floor((people.length * ratio) + 0.5);
    const maxEvents = Math.floor((events.length * ratio) + 0.5);

    const trimmedTopics = topics.slice(0, Math.max(1, maxTopics));
    const trimmedPeople = people.slice(0, Math.max(1, maxPeople));
    const trimmedEvents = events.slice(0, Math.max(1, maxEvents));

    const finalTokens =
      historyTokens +
      trimmedTopics.length * tokensPerEntity.topic +
      trimmedPeople.length * tokensPerEntity.person +
      trimmedEvents.length * tokensPerEntity.event;

    return {
      topics: trimmedTopics,
      people: trimmedPeople,
      events: trimmedEvents,
      tokenEstimate: finalTokens,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): RetrievalFusionConfig {
    return { ...this.config };
  }

  /**
   * Update weights
   */
  updateWeights(weights: Partial<RetrievalFusionConfig['weights']>): void {
    this.config.weights = { ...this.config.weights, ...weights };
    console.log('[Retrieval Fusion] Weights updated:', this.config.weights);
  }
}

// Singleton instance
let fusionInstance: RetrievalFusion | null = null;

/**
 * Get the retrieval fusion instance
 */
export function getRetrievalFusion(config?: Partial<RetrievalFusionConfig>): RetrievalFusion {
  if (!fusionInstance) {
    fusionInstance = new RetrievalFusion(config);
  }
  return fusionInstance;
}

/**
 * Check if fusion is enabled
 */
export function isFusionEnabled(): boolean {
  return getRetrievalFusion().isEnabled();
}
