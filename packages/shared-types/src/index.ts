/**
 * Shared Types Package
 * Exports all shared types for SecondMe services
 */

// History types
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

// Pairing types
export type {
  ContactTier,
  PairingStatus,
  PairingRequest,
  ApprovedContact,
  DeniedContact,
  PairingConfig,
  CreatePairingResult,
} from './pairing.js';

export { DEFAULT_PAIRING_CONFIG } from './pairing.js';

// Environment variable utilities
export { parseIntEnv, parseFloatEnv } from './env-utils.js';

// Runtime type guards
export {
  isStoredMessage,
  isPairingRequest,
  isApprovedContact,
  isDeniedContact,
} from './guards.js';

// Security types
export type {
  SecurityEventType,
  SecuritySeverity,
  SecurityEvent,
  SecurityLogEntry,
  ContentFlagType,
  ContentFlag,
  ContentAnalysis,
} from './security.js';
