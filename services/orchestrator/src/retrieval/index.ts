/**
 * Retrieval Module
 * Exports for semantic RAG context retrieval
 */

export {
  retrieveContext,
  getSemanticRagConfig,
  isSemanticRagEnabled,
  refreshAutomemCheck,
  type SemanticRagConfig,
  type SemanticRetrievalResult,
} from './hybrid-retriever.js';

export {
  searchRelevantTopics,
  searchRelevantPeople,
  searchRelevantEvents,
  checkVectorIndexesExist,
  type VectorSearchResult,
  type ContactFilteredResult,
} from './semantic-queries.js';

export {
  rerankResults,
  selectTopResults,
  rerankAndSelect,
  mergeRankedResults,
  logRetrievalStats,
  type RerankWeights,
  type RerankOptions,
  type RankedResult,
} from './reranker.js';
