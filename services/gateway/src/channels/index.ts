/**
 * Channels Module
 * Multi-channel messaging support for SecondMe gateway
 */

// Types
export type {
  MessageHandler,
  StatusHandler,
  ChannelDependencies,
  ChannelLogger,
  ChannelEntry,
  ChannelInitOptions,
  ProcessedMessage,
  TypingOptions,
  RateLimiterConfig,
  RateLimiterDeps,
  RateLimitResult,
  RateLimitCheckOptions,
} from './types.js';

export {
  DEFAULT_CHANNEL_INIT_OPTIONS,
  DEFAULT_TYPING_OPTIONS,
  DEFAULT_RATE_LIMITER_CONFIG,
} from './types.js';

// Rate limiting
export { RateLimiter } from './rate-limiter.js';

// Re-export shared types
export type {
  Channel,
  ChannelId,
  ChannelMessage,
  ChannelStatus,
  MessageContent,
  SendResult,
  ChannelContact,
  ChannelInfo,
  QueuedMessage,
  LinkedContact,
  SendOptions,
  ChannelManagerConfig,
} from '@secondme/shared-types';

export {
  DEFAULT_CHANNEL_CONFIG,
  isChannelId,
  isChannelMessage,
  isQueuedMessage,
} from '@secondme/shared-types';

// Base class
export { BaseChannel } from './base-channel.js';
