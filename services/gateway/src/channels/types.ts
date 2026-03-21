/**
 * Gateway Channel Types
 * Internal types for channel management in the gateway service
 */

import type {
  Channel,
  ChannelId,
  ChannelMessage,
  ChannelStatus,
  MessageContent,
  SendResult,
  ChannelContact,
} from '@secondme/shared-types';

/**
 * Event handler types for channel events
 */
export type MessageHandler = (msg: ChannelMessage) => void | Promise<void>;
export type StatusHandler = (status: ChannelStatus, error?: string) => void;

/**
 * Dependencies that channels may need
 */
export interface ChannelDependencies {
  /** Logger instance */
  logger: ChannelLogger;
  /** Event emitter for socket.io events */
  emitEvent: (event: string, data: unknown) => void;
}

/**
 * Logger interface for channels
 * Allows channels to be testable with mock loggers
 */
export interface ChannelLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Channel registration entry in the manager
 */
export interface ChannelEntry {
  /** The channel instance */
  channel: Channel;
  /** Whether this channel is currently enabled */
  enabled: boolean;
  /** Message handlers registered for this channel */
  messageHandlers: MessageHandler[];
  /** Status handlers registered for this channel */
  statusHandlers: StatusHandler[];
}

/**
 * Options for channel initialization
 */
export interface ChannelInitOptions {
  /** Whether to auto-connect on initialization */
  autoConnect?: boolean;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Number of reconnection attempts */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts */
  reconnectDelay?: number;
}

/**
 * Default initialization options
 */
export const DEFAULT_CHANNEL_INIT_OPTIONS: ChannelInitOptions = {
  autoConnect: true,
  connectionTimeout: 30000,
  maxReconnectAttempts: 5,
  reconnectDelay: 5000,
};

/**
 * Result of processing an incoming message
 */
export interface ProcessedMessage {
  /** The original channel message */
  message: ChannelMessage;
  /** Whether the message should be queued for processing */
  shouldQueue: boolean;
  /** Reason if message was dropped */
  dropReason?: string;
  /** Content analysis flags */
  flags?: string[];
}

/**
 * Typing simulation options
 */
export interface TypingOptions {
  /** Base delay in milliseconds */
  baseDelay?: number;
  /** Delay per character in milliseconds */
  perCharDelay?: number;
  /** Maximum delay cap in milliseconds */
  maxDelay?: number;
  /** Random jitter range in milliseconds */
  jitterRange?: number;
}

/**
 * Default typing simulation options
 */
export const DEFAULT_TYPING_OPTIONS: TypingOptions = {
  baseDelay: 30,
  perCharDelay: 2,
  maxDelay: 5000,
  jitterRange: 500,
};

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Message threshold before rate limiting (default: 10) */
  threshold?: number;
  /** Window size in seconds (default: 60) */
  windowSeconds?: number;
  /** Whether to auto-pause when threshold exceeded (default: true) */
  autoPause?: boolean;
}

/**
 * Default rate limiter configuration
 */
export const DEFAULT_RATE_LIMITER_CONFIG: Required<RateLimiterConfig> = {
  threshold: 10,
  windowSeconds: 60,
  autoPause: true,
};

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the message is allowed */
  allowed: boolean;
  /** Current message count in the window */
  currentCount: number;
  /** Threshold that triggers rate limiting */
  threshold: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Whether auto-pause was triggered */
  autoPaused: boolean;
}

/**
 * Options for rate limit check
 */
export interface RateLimitCheckOptions {
  /** Channel ID for multi-channel support (included in events) */
  channelId?: string;
}

/**
 * Dependencies for the RateLimiter
 */
export interface RateLimiterDeps {
  /** Redis client for counter storage */
  redis: {
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    get(key: string): Promise<string | null>;
    del(...keys: string[]): Promise<number>;
    set(key: string, value: string): Promise<string | null>;
    /**
     * Execute Lua script for atomic operations
     * Note: This is Redis EVAL command, not JavaScript eval
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<any>;
  };
  /** Logger for rate limit events */
  logger: ChannelLogger;
  /** Event emitter for socket.io events */
  emitEvent: (event: string, data: unknown) => void;
  /** Publish to Redis pub/sub channels */
  publish: (channel: string, message: string) => Promise<void>;
}

// Re-export shared types for convenience
export type {
  Channel,
  ChannelId,
  ChannelMessage,
  ChannelStatus,
  MessageContent,
  SendResult,
  ChannelContact,
};
