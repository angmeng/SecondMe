/**
 * Embeddings Module
 * Task 5.1.1: Provider abstraction for semantic embedding functionality
 *
 * Exports both the new provider abstraction and backward-compatible
 * functions from the legacy voyage-client.
 */

// Provider abstraction (Task 5.1.1)
export {
  EmbeddingProvider,
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type CircuitBreakerState,
  type EmbeddingProviderConfig,
  type EmbeddingProviderType,
  getConfiguredProviderType,
} from './provider.js';

// OpenAI embeddings
export { OpenAIEmbeddings, getOpenAIEmbeddings } from './openai.js';

// Voyage embeddings
export {
  VoyageEmbeddings,
  getVoyageEmbeddings,
  type VoyageInputType,
  type VoyageEmbeddingConfig,
} from './voyage.js';

// Registry for provider management
export {
  embeddingRegistry,
  getEmbeddingProvider,
  embedText,
  embedTexts,
} from './registry.js';

// Backward compatibility - legacy voyage-client exports
export {
  embedMessage,
  embedBatch,
  formatEntityForEmbedding,
  isVoyageConfigured,
  getEmbeddingDimension,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
} from './voyage-client.js';
