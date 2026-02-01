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
  EnrichedApprovedContact,
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
  isSkillConfigField,
  isSkillManifest,
  isSkillInfo,
  isChannelId,
  isChannelMessage,
  isQueuedMessage,
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

// Skill types
export type {
  SkillPermission,
  SkillHealthStatus,
  SkillConfigField,
  SkillManifest,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillInfo,
  SkillsConfig,
} from './skills.js';

export { DEFAULT_SKILLS_CONFIG } from './skills.js';

// Channel types
export type {
  ChannelId,
  ChannelStatus,
  ChannelMessage,
  QueuedMessage,
  ChannelInfo,
  ManagedChannelInfo,
  MessageContent,
  SendResult,
  ChannelContact,
  LinkedContact,
  StoredLinkedContact,
  ResolvedContact,
  Channel,
  SendOptions,
  ChannelManagerConfig,
} from './channels.js';

export { DEFAULT_CHANNEL_CONFIG, isStoredLinkedContact } from './channels.js';

// Media types (Phase 4 - Voice & Image, Phase 5 - TTS)
export type {
  TranscriptionResult,
  ImageContent,
  MediaType,
  MediaMimeType,
  DownloadedMedia,
  TranscriptionConfig,
  ImageProcessingConfig,
  SynthesisResult,
  SynthesisConfig,
  // Task 4.1.2: Per-contact voice preferences
  VoicePreference,
  CachedVoicePreference,
} from './media.js';

export {
  DEFAULT_TRANSCRIPTION_CONFIG,
  DEFAULT_IMAGE_CONFIG,
  DEFAULT_MEDIA_LIMITS,
  DEFAULT_SYNTHESIS_CONFIG,
  // Task 4.1.2: Voice preference guard
  isVoicePreference,
} from './media.js';
