/**
 * Channel Types
 * Types for multi-channel messaging support (WhatsApp, Telegram, etc.)
 */

import type { ContactTier } from './pairing.js';

/**
 * Supported channel identifiers
 * Extensible for future channels (discord, slack, etc.)
 */
export type ChannelId = 'whatsapp' | 'telegram' | 'discord' | 'slack';

/**
 * Channel connection status
 */
export type ChannelStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

/**
 * Unified message format across all channels
 * Version 2 adds channelId and normalizedContactId for multi-channel support
 */
export interface ChannelMessage {
  /** Unique message identifier */
  id: string;
  /** Schema version for backwards compatibility */
  version: 2;
  /** Channel this message came from */
  channelId: ChannelId;
  /** Channel-specific contact identifier (e.g., 1234567890@c.us for WhatsApp) */
  contactId: string;
  /** Normalized phone number for cross-channel linking (e.g., +1234567890) */
  normalizedContactId?: string;
  /** Message text content */
  content: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Type of media attached, if any */
  mediaType?: 'text' | 'image' | 'audio' | 'video' | 'document';
  /** URL to media content, if applicable */
  mediaUrl?: string;
  /** ID of message being replied to */
  replyTo?: string;
  /** Channel-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Queued message format for Redis QUEUE:messages
 * Extends ChannelMessage with additional fields for processing
 */
export interface QueuedMessage {
  /** Schema version for backwards compatibility (v1 = WhatsApp only) */
  version: 1 | 2;
  /** Unique message identifier */
  messageId: string;
  /** Channel this message came from (defaults to 'whatsapp' for v1) */
  channelId: ChannelId;
  /** Channel-specific contact identifier */
  contactId: string;
  /** Normalized phone number for cross-channel linking */
  normalizedContactId?: string;
  /** Contact display name */
  contactName?: string;
  /** Message text content */
  content: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Channel-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Channel information for dashboard display
 */
export interface ChannelInfo {
  /** Channel identifier */
  id: ChannelId;
  /** Human-readable channel name */
  displayName: string;
  /** Icon identifier for UI */
  icon: string;
  /** Current connection status */
  status: ChannelStatus;
  /** Number of contacts on this channel */
  contactCount: number;
  /** Timestamp of last message activity */
  lastActivity?: number;
  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Content for outgoing messages
 */
export interface MessageContent {
  /** Text content of the message */
  text?: string;
  /** Media attachment */
  media?: {
    /** Type of media */
    type: 'image' | 'audio' | 'video' | 'document';
    /** URL to media file */
    url: string;
    /** Caption for media (mainly for images) */
    caption?: string;
    /** Original filename for documents */
    filename?: string;
  };
}

/**
 * Result of sending a message
 */
export interface SendResult {
  /** Whether the message was sent successfully */
  success: boolean;
  /** Message ID if successful */
  messageId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Contact information from a channel
 */
export interface ChannelContact {
  /** Channel-specific contact identifier */
  id: string;
  /** Channel this contact is on */
  channelId: ChannelId;
  /** Normalized phone number for cross-channel linking */
  normalizedId?: string;
  /** Contact display name */
  displayName?: string;
  /** URL to profile picture */
  profilePicUrl?: string;
}

/**
 * Linked contact across multiple channels
 */
export interface LinkedContact {
  /** Normalized phone number (the linking key) */
  normalizedPhone: string;
  /** All channel-specific contact IDs for this person */
  channels: Array<{
    channelId: ChannelId;
    contactId: string;
    displayName?: string;
  }>;
}

/**
 * Extended LinkedContact with timestamps for storage
 */
export interface StoredLinkedContact extends LinkedContact {
  /** When linking was first established */
  linkedAt: number;
  /** Last activity timestamp across all channels */
  lastActivity?: number;
}

/**
 * Result of resolving a contact's linked identity
 */
export interface ResolvedContact {
  contactId: string;
  channelId: ChannelId;
  normalizedPhone: string | null;
  linkedChannels: LinkedContact['channels'];
  isApproved: boolean;
  tier?: ContactTier;
}

/**
 * Type guard for StoredLinkedContact
 */
export function isStoredLinkedContact(obj: unknown): obj is StoredLinkedContact {
  if (typeof obj !== 'object' || obj === null) return false;
  const lc = obj as Record<string, unknown>;
  return (
    typeof lc['normalizedPhone'] === 'string' &&
    Array.isArray(lc['channels']) &&
    typeof lc['linkedAt'] === 'number'
  );
}

/**
 * Channel interface that all channel adapters must implement
 * This is the contract for channel implementations
 */
export interface Channel {
  /** Channel identifier */
  readonly id: ChannelId;
  /** Human-readable channel name */
  readonly displayName: string;
  /** Icon identifier for UI */
  readonly icon: string;
  /** Current connection status */
  readonly status: ChannelStatus;

  // Lifecycle methods
  /** Connect to the channel service */
  connect(): Promise<void>;
  /** Disconnect from the channel service */
  disconnect(): Promise<void>;
  /** Check if currently connected */
  isConnected(): boolean;

  // Messaging methods
  /** Send a message to a contact */
  sendMessage(to: string, content: MessageContent): Promise<SendResult>;
  /** Show typing indicator to a contact */
  sendTypingIndicator(to: string, durationMs?: number): Promise<void>;

  // Event handlers
  /** Register handler for incoming messages */
  onMessage(handler: (msg: ChannelMessage) => void): void;
  /** Unregister a message handler to prevent memory leaks */
  offMessage(handler: (msg: ChannelMessage) => void): void;
  /** Register handler for status changes */
  onStatusChange(handler: (status: ChannelStatus, error?: string) => void): void;
  /** Unregister a status handler to prevent memory leaks */
  offStatusChange(handler: (status: ChannelStatus, error?: string) => void): void;

  // Contact methods
  /** Get all contacts from this channel */
  getContacts(): Promise<ChannelContact[]>;
  /** Get a specific contact by ID */
  getContact(id: string): Promise<ChannelContact | null>;
  /** Extract normalized phone number from channel-specific contact ID */
  normalizeContactId(contactId: string): string | null;
}

/**
 * Options for sending messages
 */
export interface SendOptions {
  /** Whether to simulate typing before sending */
  simulateTyping?: boolean;
  /** Custom typing delay in milliseconds */
  typingDelay?: number;
  /** Whether to quote/reply to a specific message */
  replyToMessageId?: string;
}

/**
 * Extended channel info with enabled state for manager
 * Used by dashboard to display channel status with toggle controls
 */
export interface ManagedChannelInfo extends ChannelInfo {
  /** Whether this channel is enabled in the manager */
  enabled: boolean;
}

/**
 * Channel manager configuration
 */
export interface ChannelManagerConfig {
  /** Whether multi-channel is enabled */
  enabled: boolean;
  /** Whether to link contacts across channels by phone number */
  contactLinkingEnabled: boolean;
  /** Default channel for outgoing messages if not specified */
  defaultChannel: ChannelId;
}

/**
 * Default channel manager configuration
 */
export const DEFAULT_CHANNEL_CONFIG: ChannelManagerConfig = {
  enabled: true,
  contactLinkingEnabled: true,
  defaultChannel: 'whatsapp',
};
