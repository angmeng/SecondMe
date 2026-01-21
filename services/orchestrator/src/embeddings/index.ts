/**
 * Embeddings Module
 * Exports for semantic embedding functionality
 */

export {
  embedMessage,
  embedBatch,
  formatEntityForEmbedding,
  isVoyageConfigured,
  getEmbeddingDimension,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
} from './voyage-client.js';
