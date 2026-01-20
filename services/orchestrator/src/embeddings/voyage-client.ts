/**
 * Voyage AI Embedding Client
 * Provides semantic embeddings for RAG with Redis caching and circuit breaker
 */

import { createHash } from 'crypto';
import { redisClient } from '../redis/client.js';

const VOYAGE_API_KEY = process.env['VOYAGE_API_KEY'];
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const EMBEDDING_DIMENSION = 1024;

// Cache configuration
const CACHE_TTL_SECONDS = 300; // 5 minutes
const CACHE_KEY_PREFIX = 'EMB:msg:';

// Circuit breaker configuration
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 60000; // 1 minute

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

interface EmbeddingResult {
  embedding: number[];
  fromCache: boolean;
  tokensUsed: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

// Circuit breaker state
let circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
};

/**
 * Check if Voyage API is configured
 */
export function isVoyageConfigured(): boolean {
  return Boolean(VOYAGE_API_KEY);
}

/**
 * Get embedding dimension
 */
export function getEmbeddingDimension(): number {
  return EMBEDDING_DIMENSION;
}

/**
 * Generate cache key from text content
 */
function getCacheKey(text: string): string {
  const hash = createHash('sha256').update(text).digest('hex').substring(0, 16);
  return `${CACHE_KEY_PREFIX}${hash}`;
}

/**
 * Check circuit breaker state
 */
function checkCircuitBreaker(): boolean {
  if (!circuitBreaker.isOpen) {
    return true;
  }

  // Check if reset time has passed
  if (Date.now() - circuitBreaker.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
    console.log('[Voyage Client] Circuit breaker reset');
    circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false };
    return true;
  }

  return false;
}

/**
 * Record a failure in circuit breaker
 */
function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();

  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    console.warn(
      `[Voyage Client] Circuit breaker opened after ${circuitBreaker.failures} failures`
    );
  }
}

/**
 * Record a success in circuit breaker
 */
function recordSuccess(): void {
  if (circuitBreaker.failures > 0) {
    circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false };
  }
}

/**
 * Embed a single text message
 * Returns cached embedding if available, otherwise calls Voyage API
 */
export async function embedMessage(text: string): Promise<EmbeddingResult> {
  // Check cache first
  const cacheKey = getCacheKey(text);

  try {
    const cached = await redisClient.client.get(cacheKey);
    if (cached) {
      console.log('[Voyage Client] Cache hit for message embedding');
      return {
        embedding: JSON.parse(cached),
        fromCache: true,
        tokensUsed: 0,
      };
    }
  } catch (error) {
    console.warn('[Voyage Client] Cache read error:', error);
    // Continue to API call on cache error
  }

  // Check circuit breaker
  if (!checkCircuitBreaker()) {
    throw new Error('Voyage API circuit breaker is open');
  }

  // Check if API is configured
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY not configured');
  }

  // Call Voyage API
  const startTime = Date.now();

  try {
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: [text],
        input_type: 'query',
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
    console.log(
      `[Voyage Client] Embedding generated in ${latency}ms (${data.usage.total_tokens} tokens)`
    );

    // Record success
    recordSuccess();

    // Cache the embedding
    try {
      await redisClient.client.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(embedding));
    } catch (error) {
      console.warn('[Voyage Client] Cache write error:', error);
      // Don't fail if caching fails
    }

    return {
      embedding,
      fromCache: false,
      tokensUsed: data.usage.total_tokens,
    };
  } catch (error) {
    recordFailure();
    throw error;
  }
}

/**
 * Embed multiple texts in a batch
 * More efficient for embedding multiple entities at once
 */
export async function embedBatch(texts: string[]): Promise<{
  embeddings: number[][];
  tokensUsed: number;
}> {
  if (texts.length === 0) {
    return { embeddings: [], tokensUsed: 0 };
  }

  // Check circuit breaker
  if (!checkCircuitBreaker()) {
    throw new Error('Voyage API circuit breaker is open');
  }

  // Check if API is configured
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY not configured');
  }

  const startTime = Date.now();

  try {
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: texts,
        input_type: 'document',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Voyage API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as VoyageEmbeddingResponse;
    const embeddings = data.data.map((d) => d.embedding);

    const latency = Date.now() - startTime;
    console.log(
      `[Voyage Client] Batch embedding of ${texts.length} texts in ${latency}ms (${data.usage.total_tokens} tokens)`
    );

    // Record success
    recordSuccess();

    return {
      embeddings,
      tokensUsed: data.usage.total_tokens,
    };
  } catch (error) {
    recordFailure();
    throw error;
  }
}

/**
 * Format entity for embedding
 * Creates a rich text representation for semantic search
 */
export function formatEntityForEmbedding(
  type: 'Topic' | 'Person' | 'Event' | 'Company',
  entity: {
    name: string;
    category?: string;
    occupation?: string;
    company?: string;
    industry?: string;
    date?: string;
    description?: string;
    notes?: string;
  }
): string {
  switch (type) {
    case 'Topic':
      return `${entity.name}${entity.category ? `. Category: ${entity.category}` : ''}${entity.notes ? `. ${entity.notes}` : ''}`;

    case 'Person':
      return `${entity.name}${entity.occupation ? `, ${entity.occupation}` : ''}${entity.company ? ` at ${entity.company}` : ''}${entity.notes ? `. ${entity.notes}` : ''}`;

    case 'Event':
      return `${entity.name}${entity.date ? ` on ${entity.date}` : ''}${entity.description ? `. ${entity.description}` : ''}`;

    case 'Company':
      return `${entity.name}${entity.industry ? ` in ${entity.industry}` : ''}${entity.notes ? `. ${entity.notes}` : ''}`;

    default:
      return entity.name;
  }
}

/**
 * Get circuit breaker status (for monitoring)
 */
export function getCircuitBreakerStatus(): CircuitBreakerState {
  return { ...circuitBreaker };
}

/**
 * Reset circuit breaker (for testing or manual intervention)
 */
export function resetCircuitBreaker(): void {
  circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false };
  console.log('[Voyage Client] Circuit breaker manually reset');
}
