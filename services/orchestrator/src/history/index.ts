/**
 * Conversation History Module
 * Exports history retrieval and processing utilities
 */

export { historyCache, type ConversationMessage, type HistoryRetrievalResult } from './history-cache.js';
export {
  type StoredMessage,
  type ConversationChunk,
  extractKeywords,
  calculateKeywordOverlap,
  chunkByKeywordContinuity,
  selectMessagesFromChunks,
  processMessagesWithChunking,
  truncateMessage,
} from './keyword-chunker.js';
