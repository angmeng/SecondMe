/**
 * Voyage AI Embeddings Provider
 * Task 5.1.1: Voyage voyage-3 implementation
 *
 * Uses Voyage AI's voyage-3 model for high-quality semantic embeddings.
 * Optimized for RAG applications.
 */

import { createHash } from 'crypto';
import {
  EmbeddingProvider,
  type EmbeddingProviderConfig,
  type EmbeddingResult,
  type BatchEmbeddingResult,
} from './provider.js';
import { redisClient } from '../redis/client.js';

const VOYAGE_API_KEY = process.env['VOYAGE_API_KEY'];
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

// voyage-3: 1024 dimensions, optimized for RAG
const VOYAGE_MODEL = 'voyage-3';
const VOYAGE_DIMENSIONS = 1024;

interface VoyageEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    total_tokens: number;
  };
}

/**
 * Input type for Voyage embeddings
 * 'query' for search queries, 'document' for content to be searched
 */
export type VoyageInputType = 'query' | 'document';

/**
 * Extended config for Voyage provider
 */
export interface VoyageEmbeddingConfig extends EmbeddingProviderConfig {
  defaultInputType?: VoyageInputType;
}

/**
 * Voyage AI Embeddings Provider
 * Uses voyage-3 model optimized for RAG
 */
export class VoyageEmbeddings extends EmbeddingProvider {
  readonly name = 'Voyage';
  readonly dimensions = VOYAGE_DIMENSIONS;
  readonly model = VOYAGE_MODEL;

  private apiKey: string | undefined;
  private defaultInputType: VoyageInputType;

  constructor(config: VoyageEmbeddingConfig = {}) {
    super(config);
    this.apiKey = VOYAGE_API_KEY;
    this.defaultInputType = config.defaultInputType || 'query';
  }

  /**
   * Check if Voyage API is configured
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Embed a single text using Voyage API (called by parent's embed() which handles caching)
   */
  protected async embedSingle(text: string): Promise<EmbeddingResult> {
    // Parent's embed() already handles caching, so we just call the API directly
    return this.callVoyageApi(text, this.defaultInputType);
  }

  /**
   * Internal API call without caching (used by embedSingle and embedWithType)
   */
  private async callVoyageApi(text: string, inputType: VoyageInputType): Promise<EmbeddingResult> {
    if (!this.apiKey) {
      throw new Error('VOYAGE_API_KEY not configured');
    }

    const startTime = Date.now();

    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: [text],
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Voyage API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as VoyageEmbeddingResponse;
    const embedding = data.data[0]?.embedding;

    if (!embedding) {
      throw new Error('No embedding returned from Voyage API');
    }

    const latency = Date.now() - startTime;
    console.log(`[Voyage] Embedding generated in ${latency}ms (${data.usage.total_tokens} tokens)`);

    return {
      embedding,
      fromCache: false,
      tokensUsed: data.usage.total_tokens,
    };
  }

  /**
   * Generate type-aware cache key for Voyage embeddings
   * Different input types produce different embeddings, so we include it in the key
   */
  private getTypedCacheKey(text: string, inputType: VoyageInputType): string {
    const hash = createHash('sha256').update(text).digest('hex').substring(0, 16);
    return `EMB:voyage:${inputType}:${hash}`;
  }

  /**
   * Embed with specific input type (with type-aware caching)
   * Use this method when you need to specify query vs document input type
   */
  async embedWithType(text: string, inputType: VoyageInputType): Promise<EmbeddingResult> {
    // Check cache first with type-aware key
    const cacheKey = this.getTypedCacheKey(text, inputType);

    try {
      const cached = await redisClient.client.get(cacheKey);
      if (cached) {
        console.log(`[Voyage] Cache hit for ${inputType} embedding`);
        return {
          embedding: JSON.parse(cached),
          fromCache: true,
          tokensUsed: 0,
        };
      }
    } catch (error) {
      console.warn('[Voyage] Cache read error:', error);
    }

    // Check circuit breaker
    if (!this.checkCircuitBreaker()) {
      throw new Error('Voyage API circuit breaker is open');
    }

    try {
      const result = await this.callVoyageApi(text, inputType);

      this.recordSuccess();

      // Cache the embedding with type-aware key
      await this.cacheEmbedding(cacheKey, result.embedding);

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Embed multiple texts in a batch using Voyage API
   */
  protected async embedMultiple(texts: string[]): Promise<BatchEmbeddingResult> {
    return this.embedBatchWithType(texts, 'document');
  }

  /**
   * Batch embed with specific input type
   */
  async embedBatchWithType(texts: string[], inputType: VoyageInputType): Promise<BatchEmbeddingResult> {
    if (!this.apiKey) {
      throw new Error('VOYAGE_API_KEY not configured');
    }

    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Voyage API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as VoyageEmbeddingResponse;
    const embeddings = data.data.map((d) => d.embedding);

    return {
      embeddings,
      tokensUsed: data.usage.total_tokens,
    };
  }
}

// Singleton instance
let voyageInstance: VoyageEmbeddings | null = null;

/**
 * Get the singleton Voyage embeddings instance
 */
export function getVoyageEmbeddings(config?: VoyageEmbeddingConfig): VoyageEmbeddings {
  if (!voyageInstance) {
    voyageInstance = new VoyageEmbeddings(config);
  }
  return voyageInstance;
}
