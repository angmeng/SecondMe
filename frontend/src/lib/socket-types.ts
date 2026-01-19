/**
 * Socket Event Types
 * Type definitions for Socket.io events used in the frontend
 */

/**
 * Event emitted when a message is received from WhatsApp
 */
export interface MessageReceivedEvent {
  contactId?: string;
  contactName?: string;
  timestamp?: number;
  preview?: string;
  content?: string;
}

/**
 * Event emitted when a message is sent via WhatsApp
 */
export interface MessageSentEvent {
  messageId?: string;
  contactId?: string;
  timestamp?: number;
  delayMs?: number;
}

/**
 * Event emitted when pause state changes
 */
export interface PauseUpdateEvent {
  contactId: string;
  action: 'pause' | 'resume';
  reason?: string;
  pausedAt?: number;
}

/**
 * Event emitted when rate limit is triggered
 */
export interface RateLimitEvent {
  contactId: string;
}

/**
 * Event emitted when session is about to expire
 */
export interface SessionExpiryWarningEvent {
  needsRefresh?: boolean;
}

/**
 * Event emitted on socket errors
 */
export interface SocketErrorEvent {
  message?: string;
  error?: string;
}
