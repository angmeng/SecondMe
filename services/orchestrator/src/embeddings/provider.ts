/**
 * Embedding Provider Interface
 * Task 5.1.1: Abstraction layer for multiple embedding providers
 *
 * Allows swapping between different embedding services (OpenAI, Voyage, etc.)
 * with consistent API and caching support.
 */

import { createHash } from 'crypto';
import { redisClient } from '../redis/client.js';

/**
 * Result of a single embedding operation
 */
export interface EmbeddingResult {
  embedding: number[];
  fromCache: boolean;
  tokensUsed: number;
}

/**
 * Result of a batch embedding operation
 */
export interface BatchEmbeddingResult {
  embeddings: number[][];
  tokensUsed: number;
}

/**
 * Circuit breaker state for provider resilience
 */
export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

/**
 * Embedding provider configuration
 */
export interface EmbeddingProviderConfig {
  cacheTtlSeconds?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

/**
 * Abstract base class for embedding providers
 * Provides common functionality like caching and circuit breaking
 */
export abstract class EmbeddingProvider {
  abstract readonly name: string;
  abstract readonly dimensions: number;
  abstract readonly model: string;

  protected config: Required<EmbeddingProviderConfig>;
  protected circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
  };

  protected static readonly DEFAULT_CONFIG: Required<EmbeddingProviderConfig> = {
    cacheTtlSeconds: 300, // 5 minutes
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000, // 1 minute
  };

  constructor(config: EmbeddingProviderConfig = {}) {
    this.config = {
      ...EmbeddingProvider.DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Check if provider is configured and available
   */
  abstract isConfigured(): boolean;

  /**
   * Embed a single text string
   */
  async embed(text: string): Promise<EmbeddingResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(text);

    try {
      const cached = await redisClient.client.get(cacheKey);
      if (cached) {
        console.log(`[${this.name}] Cache hit for embedding`);
        return {
          embedding: JSON.parse(cached),
          fromCache: true,
          tokensUsed: 0,
        };
      }
    } catch (error) {
      console.warn(`[${this.name}] Cache read error:`, error);
    }

    // Check circuit breaker
    if (!this.checkCircuitBreaker()) {
      throw new Error(`${this.name} circuit breaker is open`);
    }

    // Call provider API
    const startTime = Date.now();
    try {
      const result = await this.embedSingle(text);
      const latency = Date.now() - startTime;
      console.log(`[${this.name}] Embedding generated in ${latency}ms (${result.tokensUsed} tokens)`);

      // Record success
      this.recordSuccess();

      // Cache the embedding
      await this.cacheEmbedding(cacheKey, result.embedding);

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Embed multiple texts in a batch
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], tokensUsed: 0 };
    }

    // Check circuit breaker
    if (!this.checkCircuitBreaker()) {
      throw new Error(`${this.name} circuit breaker is open`);
    }

    const startTime = Date.now();
    try {
      const result = await this.embedMultiple(texts);
      const latency = Date.now() - startTime;
      console.log(`[${this.name}] Batch embedding of ${texts.length} texts in ${latency}ms (${result.tokensUsed} tokens)`);

      // Record success
      this.recordSuccess();

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Provider-specific single embedding implementation
   */
  protected abstract embedSingle(text: string): Promise<EmbeddingResult>;

  /**
   * Provider-specific batch embedding implementation
   */
  protected abstract embedMultiple(texts: string[]): Promise<BatchEmbeddingResult>;

  /**
   * Generate a short SHA256 hash of text content (first 16 hex chars)
   */
  protected hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex').substring(0, 16);
  }

  /**
   * Generate cache key from text content
   */
  protected getCacheKey(text: string): string {
    return `EMB:${this.name.toLowerCase()}:${this.hashText(text)}`;
  }

  /**
   * Cache an embedding in Redis
   */
  protected async cacheEmbedding(cacheKey: string, embedding: number[]): Promise<void> {
    try {
      await redisClient.client.setex(cacheKey, this.config.cacheTtlSeconds, JSON.stringify(embedding));
    } catch (error) {
      console.warn(`[${this.name}] Cache write error:`, error);
    }
  }

  /**
   * Check if circuit breaker allows requests
   */
  protected checkCircuitBreaker(): boolean {
    if (!this.circuitBreaker.isOpen) {
      return true;
    }

    // Check if reset time has passed
    if (Date.now() - this.circuitBreaker.lastFailure > this.config.circuitBreakerResetMs) {
      console.log(`[${this.name}] Circuit breaker reset`);
      this.circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false };
      return true;
    }

    return false;
  }

  /**
   * Record a failure in circuit breaker
   */
  protected recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
      this.circuitBreaker.isOpen = true;
      console.warn(`[${this.name}] Circuit breaker opened after ${this.circuitBreaker.failures} failures`);
    }
  }

  /**
   * Record a success in circuit breaker
   */
  protected recordSuccess(): void {
    if (this.circuitBreaker.failures > 0) {
      this.circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false };
    }
  }

  /**
   * Get circuit breaker status (for monitoring)
   */
  getCircuitBreakerStatus(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  /**
   * Reset circuit breaker (for testing or manual intervention)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false };
    console.log(`[${this.name}] Circuit breaker manually reset`);
  }
}

/**
 * Embedding provider type for configuration
 */
export type EmbeddingProviderType = 'voyage' | 'openai';

/**
 * Get the currently configured provider type from environment
 */
export function getConfiguredProviderType(): EmbeddingProviderType {
  const provider = process.env['EMBEDDING_PROVIDER']?.toLowerCase();
  if (provider === 'openai') {
    return 'openai';
  }
  return 'voyage'; // Default to Voyage
}
