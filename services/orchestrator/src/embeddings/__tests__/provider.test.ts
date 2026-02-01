/**
 * Embedding Provider Tests
 * Tests for the abstract EmbeddingProvider base class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EmbeddingProvider,
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type EmbeddingProviderConfig,
} from '../provider.js';

// Mock Redis client
vi.mock('../../redis/client.js', () => ({
  redisClient: {
    client: {
      get: vi.fn(),
      setex: vi.fn(),
    },
  },
}));

import { redisClient } from '../../redis/client.js';

// Concrete implementation for testing
class TestEmbeddings extends EmbeddingProvider {
  readonly name = 'Test';
  readonly dimensions = 128;
  readonly model = 'test-model';

  private configured: boolean;
  private shouldFail: boolean;

  constructor(config: EmbeddingProviderConfig = {}, options?: { configured?: boolean; shouldFail?: boolean }) {
    super(config);
    this.configured = options?.configured ?? true;
    this.shouldFail = options?.shouldFail ?? false;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  protected async embedSingle(text: string): Promise<EmbeddingResult> {
    if (this.shouldFail) {
      throw new Error('API error');
    }
    return {
      embedding: Array(this.dimensions).fill(0.1),
      fromCache: false,
      tokensUsed: text.length,
    };
  }

  protected async embedMultiple(texts: string[]): Promise<BatchEmbeddingResult> {
    if (this.shouldFail) {
      throw new Error('API error');
    }
    return {
      embeddings: texts.map(() => Array(this.dimensions).fill(0.1)),
      tokensUsed: texts.join('').length,
    };
  }

  // Expose protected methods for testing
  public testCheckCircuitBreaker(): boolean {
    return this.checkCircuitBreaker();
  }

  public testRecordFailure(): void {
    this.recordFailure();
  }

  public testRecordSuccess(): void {
    this.recordSuccess();
  }
}

describe('EmbeddingProvider', () => {
  let provider: TestEmbeddings;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TestEmbeddings();
  });

  describe('embed()', () => {
    it('should return cached embedding if available', async () => {
      const cachedEmbedding = Array(128).fill(0.5);
      vi.mocked(redisClient.client.get).mockResolvedValue(JSON.stringify(cachedEmbedding));

      const result = await provider.embed('test text');

      expect(result.fromCache).toBe(true);
      expect(result.tokensUsed).toBe(0);
      expect(result.embedding).toEqual(cachedEmbedding);
    });

    it('should call embedSingle and cache result on cache miss', async () => {
      vi.mocked(redisClient.client.get).mockResolvedValue(null);
      vi.mocked(redisClient.client.setex).mockResolvedValue('OK');

      const result = await provider.embed('test text');

      expect(result.fromCache).toBe(false);
      expect(result.tokensUsed).toBe(9); // 'test text'.length
      expect(redisClient.client.setex).toHaveBeenCalled();
    });

    it('should handle cache read errors gracefully', async () => {
      vi.mocked(redisClient.client.get).mockRejectedValue(new Error('Redis error'));
      vi.mocked(redisClient.client.setex).mockResolvedValue('OK');

      const result = await provider.embed('test text');

      expect(result.fromCache).toBe(false);
    });
  });

  describe('embedBatch()', () => {
    it('should return empty result for empty input', async () => {
      const result = await provider.embedBatch([]);

      expect(result.embeddings).toHaveLength(0);
      expect(result.tokensUsed).toBe(0);
    });

    it('should embed multiple texts', async () => {
      const result = await provider.embedBatch(['text1', 'text2']);

      expect(result.embeddings).toHaveLength(2);
      expect(result.tokensUsed).toBe(10); // 'text1text2'.length
    });
  });

  describe('circuit breaker', () => {
    it('should start with circuit closed', () => {
      const status = provider.getCircuitBreakerStatus();

      expect(status.isOpen).toBe(false);
      expect(status.failures).toBe(0);
    });

    it('should open circuit after threshold failures', () => {
      // Default threshold is 5
      for (let i = 0; i < 5; i++) {
        provider.testRecordFailure();
      }

      const status = provider.getCircuitBreakerStatus();
      expect(status.isOpen).toBe(true);
      expect(status.failures).toBe(5);
    });

    it('should block requests when circuit is open', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        provider.testRecordFailure();
      }

      vi.mocked(redisClient.client.get).mockResolvedValue(null);

      await expect(provider.embed('test')).rejects.toThrow('circuit breaker is open');
    });

    it('should reset circuit after success', () => {
      provider.testRecordFailure();
      provider.testRecordFailure();

      expect(provider.getCircuitBreakerStatus().failures).toBe(2);

      provider.testRecordSuccess();

      expect(provider.getCircuitBreakerStatus().failures).toBe(0);
    });

    it('should reset circuit manually', () => {
      for (let i = 0; i < 5; i++) {
        provider.testRecordFailure();
      }

      expect(provider.getCircuitBreakerStatus().isOpen).toBe(true);

      provider.resetCircuitBreaker();

      expect(provider.getCircuitBreakerStatus().isOpen).toBe(false);
      expect(provider.getCircuitBreakerStatus().failures).toBe(0);
    });

    it('should reset circuit after timeout', async () => {
      const shortTimeout = new TestEmbeddings({ circuitBreakerResetMs: 10 });

      for (let i = 0; i < 5; i++) {
        shortTimeout.testRecordFailure();
      }

      expect(shortTimeout.getCircuitBreakerStatus().isOpen).toBe(true);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 15));

      expect(shortTimeout.testCheckCircuitBreaker()).toBe(true);
    });
  });

  describe('isConfigured()', () => {
    it('should return true when configured', () => {
      const configured = new TestEmbeddings({}, { configured: true });
      expect(configured.isConfigured()).toBe(true);
    });

    it('should return false when not configured', () => {
      const notConfigured = new TestEmbeddings({}, { configured: false });
      expect(notConfigured.isConfigured()).toBe(false);
    });
  });
});
