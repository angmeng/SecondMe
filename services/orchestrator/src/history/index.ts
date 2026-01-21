/**
 * Conversation History Module
 * Exports history retrieval and processing utilities
 */

// Re-export types from shared package
export type {
  StoredMessage,
  ConversationMessage,
  ConversationChunk,
  HistoryRetrievalResult,
} from '@secondme/shared-types';

// Export cache instance and functions
export { historyCache } from './history-cache.js';
export {
  extractKeywords,
  calculateKeywordOverlap,
  chunkByKeywordContinuity,
  selectMessagesFromChunks,
  processMessagesWithChunking,
  truncateMessage,
} from './keyword-chunker.js';
