/**
 * OpenAI Embeddings Provider
 * Task 5.1.1: OpenAI text-embedding-3-small implementation
 *
 * Uses OpenAI's text-embedding-3-small model for semantic embeddings.
 * Provides good balance of quality and cost.
 */

import {
  EmbeddingProvider,
  type EmbeddingProviderConfig,
  type EmbeddingResult,
  type BatchEmbeddingResult,
} from './provider.js';

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';

// text-embedding-3-small: 1536 dimensions, $0.02/1M tokens
const OPENAI_MODEL = 'text-embedding-3-small';
const OPENAI_DIMENSIONS = 1536;

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI Embeddings Provider
 * Uses text-embedding-3-small model
 */
export class OpenAIEmbeddings extends EmbeddingProvider {
  readonly name = 'OpenAI';
  readonly dimensions = OPENAI_DIMENSIONS;
  readonly model = OPENAI_MODEL;

  private apiKey: string | undefined;

  constructor(config: EmbeddingProviderConfig = {}) {
    super(config);
    this.apiKey = OPENAI_API_KEY;
  }

  /**
   * Check if OpenAI API is configured
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Embed a single text using OpenAI API
   */
  protected async embedSingle(text: string): Promise<EmbeddingResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;
    const embedding = data.data[0]?.embedding;

    if (!embedding) {
      throw new Error('No embedding returned from OpenAI API');
    }

    return {
      embedding,
      fromCache: false,
      tokensUsed: data.usage.total_tokens,
    };
  }

  /**
   * Embed multiple texts in a batch using OpenAI API
   */
  protected async embedMultiple(texts: string[]): Promise<BatchEmbeddingResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;

    // Sort by index to maintain order
    const sortedData = [...data.data].sort((a, b) => a.index - b.index);
    const embeddings = sortedData.map((d) => d.embedding);

    return {
      embeddings,
      tokensUsed: data.usage.total_tokens,
    };
  }
}

// Singleton instance
let openAIInstance: OpenAIEmbeddings | null = null;

/**
 * Get the singleton OpenAI embeddings instance
 */
export function getOpenAIEmbeddings(config?: EmbeddingProviderConfig): OpenAIEmbeddings {
  if (!openAIInstance) {
    openAIInstance = new OpenAIEmbeddings(config);
  }
  return openAIInstance;
}
