/**
 * Embedding Registry Tests
 * Tests for the embedding provider registry and factory
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock environment and Redis before importing registry
vi.mock('../../redis/client.js', () => ({
  redisClient: {
    client: {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
    },
  },
}));

// Mock the provider modules
vi.mock('../openai.js', () => {
  class MockOpenAIEmbeddings {
    readonly name = 'OpenAI';
    readonly dimensions = 1536;
    readonly model = 'text-embedding-3-small';
    private configured: boolean;

    constructor() {
      this.configured = Boolean(process.env['OPENAI_API_KEY']);
    }

    isConfigured() {
      return this.configured;
    }

    getCircuitBreakerStatus() {
      return { failures: 0, isOpen: false, lastFailure: 0 };
    }

    resetCircuitBreaker() {}

    async embed(text: string) {
      return { embedding: [], fromCache: false, tokensUsed: 0 };
    }

    async embedBatch(texts: string[]) {
      return { embeddings: [], tokensUsed: 0 };
    }
  }

  return {
    OpenAIEmbeddings: MockOpenAIEmbeddings,
    getOpenAIEmbeddings: vi.fn(() => new MockOpenAIEmbeddings()),
  };
});

vi.mock('../voyage.js', () => {
  class MockVoyageEmbeddings {
    readonly name = 'Voyage';
    readonly dimensions = 1024;
    readonly model = 'voyage-3';
    private configured: boolean;

    constructor() {
      this.configured = Boolean(process.env['VOYAGE_API_KEY']);
    }

    isConfigured() {
      return this.configured;
    }

    getCircuitBreakerStatus() {
      return { failures: 0, isOpen: false, lastFailure: 0 };
    }

    resetCircuitBreaker() {}

    async embed(text: string) {
      return { embedding: [], fromCache: false, tokensUsed: 0 };
    }

    async embedBatch(texts: string[]) {
      return { embeddings: [], tokensUsed: 0 };
    }
  }

  return {
    VoyageEmbeddings: MockVoyageEmbeddings,
    getVoyageEmbeddings: vi.fn(() => new MockVoyageEmbeddings()),
  };
});

describe('EmbeddingProviderRegistry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Reset environment
    delete process.env['EMBEDDING_PROVIDER'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['VOYAGE_API_KEY'];
  });

  describe('getProvider()', () => {
    it('should return voyage provider by default', async () => {
      const { embeddingRegistry } = await import('../registry.js');
      embeddingRegistry.clearCache();

      const provider = embeddingRegistry.getProvider();

      expect(provider.name).toBe('Voyage');
    });

    it('should return openai provider when specified', async () => {
      process.env['EMBEDDING_PROVIDER'] = 'openai';
      vi.resetModules();

      const { embeddingRegistry } = await import('../registry.js');
      embeddingRegistry.clearCache();

      const provider = embeddingRegistry.getProvider('openai');

      expect(provider.name).toBe('OpenAI');
    });

    it('should cache provider instances', async () => {
      const { embeddingRegistry } = await import('../registry.js');
      embeddingRegistry.clearCache();

      const provider1 = embeddingRegistry.getProvider('voyage');
      const provider2 = embeddingRegistry.getProvider('voyage');

      expect(provider1).toBe(provider2);
    });
  });

  describe('getAvailableProvider()', () => {
    it('should return null when no provider is configured', async () => {
      const { embeddingRegistry } = await import('../registry.js');
      embeddingRegistry.clearCache();

      const provider = embeddingRegistry.getAvailableProvider();

      expect(provider).toBeNull();
    });

    it('should return configured provider', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-key';
      vi.resetModules();

      const { embeddingRegistry } = await import('../registry.js');
      embeddingRegistry.clearCache();

      const provider = embeddingRegistry.getAvailableProvider();

      expect(provider).not.toBeNull();
      expect(provider?.name).toBe('Voyage');
    });

    it('should fallback to alternative provider', async () => {
      process.env['OPENAI_API_KEY'] = 'test-key';
      vi.resetModules();

      const { embeddingRegistry } = await import('../registry.js');
      embeddingRegistry.clearCache();

      const provider = embeddingRegistry.getAvailableProvider();

      expect(provider).not.toBeNull();
      expect(provider?.name).toBe('OpenAI');
    });
  });

  describe('setDefaultProvider()', () => {
    it('should change the default provider', async () => {
      const { embeddingRegistry } = await import('../registry.js');
      embeddingRegistry.clearCache();

      embeddingRegistry.setDefaultProvider('openai');
      const provider = embeddingRegistry.getDefaultProvider();

      expect(provider.name).toBe('OpenAI');
    });
  });

  describe('getStatus()', () => {
    it('should return status for all providers', async () => {
      const { embeddingRegistry } = await import('../registry.js');
      embeddingRegistry.clearCache();

      const status = embeddingRegistry.getStatus();

      expect(status).toHaveLength(2);
      expect(status.map(s => s.type)).toContain('voyage');
      expect(status.map(s => s.type)).toContain('openai');
    });
  });

  describe('resetAllCircuitBreakers()', () => {
    it('should reset all circuit breakers', async () => {
      const { embeddingRegistry } = await import('../registry.js');
      embeddingRegistry.clearCache();

      // Get providers to create instances
      embeddingRegistry.getProvider('voyage');
      embeddingRegistry.getProvider('openai');

      // Should not throw
      expect(() => embeddingRegistry.resetAllCircuitBreakers()).not.toThrow();
    });
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env['EMBEDDING_PROVIDER'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['VOYAGE_API_KEY'];
  });

  describe('embedText()', () => {
    it('should throw when no provider configured', async () => {
      const { embedText } = await import('../registry.js');

      await expect(embedText('test')).rejects.toThrow('No embedding provider configured');
    });

    it('should embed text when provider is configured', async () => {
      process.env['VOYAGE_API_KEY'] = 'test-key';
      vi.resetModules();

      const { embedText, embeddingRegistry } = await import('../registry.js');
      embeddingRegistry.clearCache();

      const result = await embedText('test');

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('embedTexts()', () => {
    it('should throw when no provider configured', async () => {
      const { embedTexts } = await import('../registry.js');

      await expect(embedTexts(['test1', 'test2'])).rejects.toThrow('No embedding provider configured');
    });
  });
});
