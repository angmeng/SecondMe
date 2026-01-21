/**
 * Conversation History Configuration
 * Configures storage and retrieval of conversation history for RAG context
 */

export interface HistoryStorageConfig {
  /** Maximum messages to store per contact */
  maxMessages: number;
  /** TTL in seconds (auto-expire old history) */
  ttlSeconds: number;
  /** Redis key prefix */
  keyPrefix: string;
}

export interface HistoryRetrievalConfig {
  /** Maximum tokens for history in prompt */
  maxTokens: number;
  /** Minimum messages to retrieve (even if under token budget) */
  minMessages: number;
  /** Maximum messages to retrieve */
  maxMessages: number;
  /** Maximum age of messages to include (hours) */
  maxAgeHours: number;
  /** Maximum length per message before truncation */
  maxMessageLength: number;
}

export interface KeywordChunkingConfig {
  /** Time gap (minutes) to consider as potential topic boundary */
  gapMinutes: number;
  /** Minimum keyword overlap ratio to keep in same chunk (0-1) */
  minKeywordOverlap: number;
  /** Minimum word length to consider as keyword */
  minWordLength: number;
}

export interface HistoryConfig {
  /** Feature flag */
  enabled: boolean;
  /** Storage configuration (Gateway) */
  storage: HistoryStorageConfig;
  /** Retrieval configuration (Orchestrator) */
  retrieval: HistoryRetrievalConfig;
  /** Keyword chunking configuration */
  chunking: KeywordChunkingConfig;
}

/**
 * Default configuration values
 */
export const historyConfig: HistoryConfig = {
  // Feature flag - can be disabled via environment variable
  enabled: process.env['ENABLE_CONVERSATION_HISTORY'] !== 'false',

  storage: {
    maxMessages: 100, // Store buffer for chunking
    ttlSeconds: 7 * 24 * 60 * 60, // 7 days
    keyPrefix: 'HISTORY:',
  },

  retrieval: {
    maxTokens: 1500, // Token budget for history
    minMessages: 5, // Always get some context
    maxMessages: 40, // Don't go too far back
    maxAgeHours: 24, // Ignore messages older than 24h
    maxMessageLength: 500, // Truncate very long messages
  },

  chunking: {
    gapMinutes: 10, // 10 minute gap = potential topic boundary
    minKeywordOverlap: 0.25, // 25% keyword overlap to stay in same chunk
    minWordLength: 4, // Words shorter than 4 chars are filtered
  },
};

/**
 * Get the Redis key for a contact's history
 */
export function getHistoryKey(contactId: string): string {
  return `${historyConfig.storage.keyPrefix}${contactId}`;
}

/**
 * Estimate token count for a string (rough approximation)
 * Uses ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export default historyConfig;
