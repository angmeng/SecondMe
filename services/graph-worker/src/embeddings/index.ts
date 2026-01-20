/**
 * Embeddings Module for Graph Worker
 * Exports for entity embedding functionality
 */

export {
  embedEntities,
  embedEntity,
  isEmbeddingEnabled,
  hasEmbedding,
  getEntitiesWithoutEmbeddings,
  backfillEmbeddings,
} from './entity-embedder.js';
