/**
 * Shared Event Name Constants
 * Central definitions for all inter-service and real-time event identifiers.
 * Import these instead of using raw string literals to prevent typos and
 * make cross-service event contracts explicit.
 */

/** Redis pub/sub channel names for inter-service communication */
export const REDIS_EVENTS = {
  QR: 'events:qr',
  STATUS: 'events:status',
  PAUSE: 'events:pause',
  PAIRING: 'events:pairing',
  METRICS_SYSTEM: 'metrics:system',
} as const;

/** Socket.io event names for real-time frontend updates */
export const SOCKET_EVENTS = {
  // Authentication & Connection
  QR_CODE: 'qr_code',
  CONNECTION_STATUS: 'connection_status',
  LOADING_STATUS: 'loading_status',

  // Messaging
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_FAILED: 'message_failed',
  MESSAGE_STATUS: 'message_status',
  NEW_MESSAGE: 'new_message',

  // Pairing
  PAIRING_REQUEST: 'pairing_request',
  PAIRING_APPROVED: 'pairing_approved',

  // Pause/Resume
  PAUSE_UPDATE: 'pause_update',

  // Rate Limiting
  RATE_LIMIT: 'rate_limit',
  RATE_LIMIT_TRIGGERED: 'rate_limit_triggered',

  // Typing
  TYPING_STATUS: 'typing_status',

  // Channels
  CHANNEL_STATUS: 'channel_status',
  CHANNEL_MANAGER_STATUS: 'channel_manager_status',

  // Session
  SESSION_UPDATE: 'session_update',
  SESSION_EXPIRY_WARNING: 'session_expiry_warning',
  SESSION_EXPIRED: 'session_expired',
  SESSION_REFRESH_REQUIRED: 'session_refresh_required',
  SESSION_REFRESHED: 'session_refreshed',

  // Error
  ERROR: 'error',

  // Dashboard
  BOT_STATUS_UPDATE: 'bot_status_update',
  METRICS_UPDATE: 'metrics_update',
} as const;
