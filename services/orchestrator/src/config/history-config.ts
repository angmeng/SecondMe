/**
 * Conversation History Configuration
 * Configures storage and retrieval of conversation history for RAG context
 */

import {
  type HistoryConfig,
  type HistoryStorageConfig,
  type HistoryRetrievalConfig,
  type KeywordChunkingConfig,
  parseIntEnv,
  parseFloatEnv,
} from '@secondme/shared-types';

// Re-export types for convenience
export type {
  HistoryConfig,
  HistoryStorageConfig,
  HistoryRetrievalConfig,
  KeywordChunkingConfig,
};

// Default values (can be overridden via environment variables)
const DEFAULTS = {
  // Storage defaults (must match gateway)
  HISTORY_KEY_PREFIX: 'HISTORY:',
  HISTORY_MAX_MESSAGES: 100,
  HISTORY_TTL_SECONDS: 7 * 24 * 60 * 60, // 7 days

  // Retrieval defaults
  HISTORY_MAX_TOKENS: 1500,
  HISTORY_MIN_MESSAGES: 5,
  HISTORY_RETRIEVAL_MAX_MESSAGES: 40,
  HISTORY_MAX_AGE_HOURS: 24,
  HISTORY_MAX_MESSAGE_LENGTH: 500,

  // Chunking defaults
  HISTORY_GAP_MINUTES: 10,
  HISTORY_MIN_KEYWORD_OVERLAP: 0.25,
  HISTORY_MIN_WORD_LENGTH: 4,
};

/**
 * Configuration values loaded from environment variables with defaults
 * Using environment variables ensures Gateway and Orchestrator stay in sync
 */
export const historyConfig: HistoryConfig = {
  // Feature flag - can be disabled via environment variable
  enabled: process.env['ENABLE_CONVERSATION_HISTORY'] !== 'false',

  // Storage config (must match gateway for correct Redis key lookup)
  storage: {
    keyPrefix: process.env['HISTORY_KEY_PREFIX'] || DEFAULTS.HISTORY_KEY_PREFIX,
    maxMessages: parseIntEnv('HISTORY_MAX_MESSAGES', DEFAULTS.HISTORY_MAX_MESSAGES),
    ttlSeconds: parseIntEnv('HISTORY_TTL_SECONDS', DEFAULTS.HISTORY_TTL_SECONDS),
  },

  // Retrieval config
  retrieval: {
    maxTokens: parseIntEnv('HISTORY_MAX_TOKENS', DEFAULTS.HISTORY_MAX_TOKENS),
    minMessages: parseIntEnv('HISTORY_MIN_MESSAGES', DEFAULTS.HISTORY_MIN_MESSAGES),
    maxMessages: parseIntEnv('HISTORY_RETRIEVAL_MAX_MESSAGES', DEFAULTS.HISTORY_RETRIEVAL_MAX_MESSAGES),
    maxAgeHours: parseIntEnv('HISTORY_MAX_AGE_HOURS', DEFAULTS.HISTORY_MAX_AGE_HOURS),
    maxMessageLength: parseIntEnv('HISTORY_MAX_MESSAGE_LENGTH', DEFAULTS.HISTORY_MAX_MESSAGE_LENGTH),
  },

  // Chunking config
  chunking: {
    gapMinutes: parseIntEnv('HISTORY_GAP_MINUTES', DEFAULTS.HISTORY_GAP_MINUTES),
    minKeywordOverlap: parseFloatEnv('HISTORY_MIN_KEYWORD_OVERLAP', DEFAULTS.HISTORY_MIN_KEYWORD_OVERLAP),
    minWordLength: parseIntEnv('HISTORY_MIN_WORD_LENGTH', DEFAULTS.HISTORY_MIN_WORD_LENGTH),
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
