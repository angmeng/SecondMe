/**
 * Voyage AI Embeddings Provider
 * Task 5.1.1: Voyage voyage-3 implementation
 *
 * Uses Voyage AI's voyage-3 model for high-quality semantic embeddings.
 * Optimized for RAG applications.
 */

import {
  EmbeddingProvider,
  type EmbeddingProviderConfig,
  type EmbeddingResult,
  type BatchEmbeddingResult,
} from './provider.js';

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
   * Embed a single text using Voyage API
   */
  protected async embedSingle(text: string): Promise<EmbeddingResult> {
    return this.embedWithType(text, this.defaultInputType);
  }

  /**
   * Embed with specific input type
   */
  async embedWithType(text: string, inputType: VoyageInputType): Promise<EmbeddingResult> {
    // Skip cache check for type-specific embedding (handled in parent)
    if (!this.checkCircuitBreaker()) {
      throw new Error('Voyage API circuit breaker is open');
    }

    if (!this.apiKey) {
      throw new Error('VOYAGE_API_KEY not configured');
    }

    const startTime = Date.now();

    try {
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

      this.recordSuccess();

      return {
        embedding,
        fromCache: false,
        tokensUsed: data.usage.total_tokens,
      };
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
