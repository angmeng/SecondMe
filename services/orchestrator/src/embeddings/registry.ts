/**
 * Embedding Provider Registry
 * Task 5.1.1: Manages embedding providers with configurable selection
 *
 * Provides a factory for creating and caching embedding providers,
 * with automatic fallback and provider switching.
 */

import {
  EmbeddingProvider,
  type EmbeddingProviderConfig,
  type EmbeddingProviderType,
  getConfiguredProviderType,
} from './provider.js';
import { VoyageEmbeddings, type VoyageEmbeddingConfig } from './voyage.js';
import { OpenAIEmbeddings } from './openai.js';

/**
 * Registry for managing embedding providers
 */
class EmbeddingProviderRegistry {
  private providers: Map<EmbeddingProviderType, EmbeddingProvider> = new Map();
  private defaultProvider: EmbeddingProviderType;

  constructor() {
    this.defaultProvider = getConfiguredProviderType();
    console.log(`[EmbeddingRegistry] Default provider: ${this.defaultProvider}`);
  }

  /**
   * Get or create a provider instance
   */
  getProvider(type?: EmbeddingProviderType, config?: EmbeddingProviderConfig): EmbeddingProvider {
    const providerType = type || this.defaultProvider;

    // Return cached instance if available
    if (this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }

    // Create new instance
    const provider = this.createProvider(providerType, config);
    this.providers.set(providerType, provider);
    return provider;
  }

  /**
   * Create a new provider instance
   */
  private createProvider(
    type: EmbeddingProviderType,
    config?: EmbeddingProviderConfig
  ): EmbeddingProvider {
    switch (type) {
      case 'openai':
        return new OpenAIEmbeddings(config);
      case 'voyage':
        return new VoyageEmbeddings(config as VoyageEmbeddingConfig);
      default:
        throw new Error(`Unknown embedding provider type: ${type}`);
    }
  }

  /**
   * Get the default provider
   */
  getDefaultProvider(): EmbeddingProvider {
    return this.getProvider();
  }

  /**
   * Set the default provider type
   */
  setDefaultProvider(type: EmbeddingProviderType): void {
    this.defaultProvider = type;
    console.log(`[EmbeddingRegistry] Default provider set to: ${type}`);
  }

  /**
   * Get configured provider that is available
   * Falls back to another provider if the default is not configured
   */
  getAvailableProvider(): EmbeddingProvider | null {
    // Try default provider first
    const defaultProvider = this.getProvider();
    if (defaultProvider.isConfigured()) {
      return defaultProvider;
    }

    // Try fallback providers
    const fallbackOrder: EmbeddingProviderType[] =
      this.defaultProvider === 'voyage' ? ['openai'] : ['voyage'];

    for (const type of fallbackOrder) {
      const provider = this.getProvider(type);
      if (provider.isConfigured()) {
        console.log(`[EmbeddingRegistry] Using fallback provider: ${type}`);
        return provider;
      }
    }

    console.warn('[EmbeddingRegistry] No embedding provider configured');
    return null;
  }

  /**
   * Check if any provider is available
   */
  isAnyProviderConfigured(): boolean {
    return this.getAvailableProvider() !== null;
  }

  /**
   * Get status of all providers
   */
  getStatus(): Array<{
    type: EmbeddingProviderType;
    name: string;
    isConfigured: boolean;
    dimensions: number;
    circuitBreaker: { failures: number; isOpen: boolean };
  }> {
    const types: EmbeddingProviderType[] = ['voyage', 'openai'];

    return types.map((type) => {
      const provider = this.getProvider(type);
      const cbStatus = provider.getCircuitBreakerStatus();

      return {
        type,
        name: provider.name,
        isConfigured: provider.isConfigured(),
        dimensions: provider.dimensions,
        circuitBreaker: {
          failures: cbStatus.failures,
          isOpen: cbStatus.isOpen,
        },
      };
    });
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers(): void {
    for (const provider of this.providers.values()) {
      provider.resetCircuitBreaker();
    }
    console.log('[EmbeddingRegistry] All circuit breakers reset');
  }

  /**
   * Clear cached provider instances (for testing)
   */
  clearCache(): void {
    this.providers.clear();
  }
}

// Singleton instance
export const embeddingRegistry = new EmbeddingProviderRegistry();

/**
 * Convenience function to get the default embedding provider
 */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  return embeddingRegistry.getAvailableProvider();
}

/**
 * Convenience function to embed text using the default provider
 */
export async function embedText(text: string): Promise<number[]> {
  const provider = embeddingRegistry.getAvailableProvider();
  if (!provider) {
    throw new Error('No embedding provider configured');
  }

  const result = await provider.embed(text);
  return result.embedding;
}

/**
 * Convenience function to embed multiple texts
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const provider = embeddingRegistry.getAvailableProvider();
  if (!provider) {
    throw new Error('No embedding provider configured');
  }

  const result = await provider.embedBatch(texts);
  return result.embeddings;
}
