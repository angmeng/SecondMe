/**
 * Shared History Types
 * Single source of truth for conversation history types used by Gateway and Orchestrator
 */

/**
 * Message structure stored in Redis
 * Used by Gateway for storage and Orchestrator for retrieval
 */
export interface StoredMessage {
  /** Unique message ID (for idempotency) */
  id: string;
  /** Message role: 'user' (contact) or 'assistant' (bot/user manual) */
  role: 'user' | 'assistant';
  /** Message content */
  content: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Source type for debugging */
  type: 'incoming' | 'outgoing' | 'fromMe';
}

/**
 * Message format for Claude API
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Configuration for history storage (Gateway)
 */
export interface HistoryStorageConfig {
  /** Maximum messages to store per contact */
  maxMessages: number;
  /** TTL in seconds (auto-expire old history) */
  ttlSeconds: number;
  /** Redis key prefix */
  keyPrefix: string;
}

/**
 * Configuration for history retrieval (Orchestrator)
 */
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

/**
 * Configuration for keyword-based chunking
 */
export interface KeywordChunkingConfig {
  /** Time gap (minutes) to consider as potential topic boundary */
  gapMinutes: number;
  /** Minimum keyword overlap ratio to keep in same chunk (0-1) */
  minKeywordOverlap: number;
  /** Minimum word length to consider as keyword */
  minWordLength: number;
}

/**
 * Complete history configuration
 */
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
 * Result of history retrieval
 */
export interface HistoryRetrievalResult {
  messages: ConversationMessage[];
  messageCount: number;
  tokenEstimate: number;
  method: 'chunked' | 'direct' | 'disabled';
}

/**
 * A chunk of related messages (same topic/conversation thread)
 */
export interface ConversationChunk {
  messages: StoredMessage[];
  keywords: Set<string>;
  startTime: number;
  endTime: number;
  tokenCount: number;
}
