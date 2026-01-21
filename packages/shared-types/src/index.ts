/**
 * Shared Types Package
 * Exports all shared types for SecondMe services
 */

export type {
  StoredMessage,
  ConversationMessage,
  HistoryStorageConfig,
  HistoryRetrievalConfig,
  KeywordChunkingConfig,
  HistoryConfig,
  HistoryRetrievalResult,
  ConversationChunk,
} from './history.js';

// Environment variable utilities
export { parseIntEnv, parseFloatEnv } from './env-utils.js';

// Runtime type guards
export { isStoredMessage } from './guards.js';
