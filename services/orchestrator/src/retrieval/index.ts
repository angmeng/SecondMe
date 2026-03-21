/**
 * Retrieval Module
 * Exports for semantic RAG context retrieval
 *
 * Task 5.1.3: Enhanced with retrieval fusion for multiple sources
 */

// Hybrid retriever (existing)
export {
  retrieveContext,
  getSemanticRagConfig,
  isSemanticRagEnabled,
  refreshAutomemCheck,
  type SemanticRagConfig,
  type SemanticRetrievalResult,
} from './hybrid-retriever.js';

// Retrieval fusion (Task 5.1.3)
export {
  RetrievalFusion,
  getRetrievalFusion,
  isFusionEnabled,
  type RetrievalFusionConfig,
  type FusionResult,
  type RetrievalSource,
} from './fusion.js';
