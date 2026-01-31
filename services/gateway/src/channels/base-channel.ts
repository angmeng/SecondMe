/**
 * Base Channel
 * Abstract base class providing common functionality for all channel implementations
 */

import type {
  Channel,
  ChannelId,
  ChannelStatus,
  ChannelMessage,
  MessageContent,
  SendResult,
  ChannelContact,
} from '@secondme/shared-types';
import type {
  MessageHandler,
  StatusHandler,
  ChannelDependencies,
  ChannelInitOptions,
  ChannelLogger,
} from './types.js';
import { DEFAULT_CHANNEL_INIT_OPTIONS } from './types.js';

/**
 * Abstract base class for channel implementations
 * Provides common functionality like event handling, status management, and logging
 */
export abstract class BaseChannel implements Channel {
  abstract readonly id: ChannelId;
  abstract readonly displayName: string;
  abstract readonly icon: string;

  protected _status: ChannelStatus = 'disconnected';
  protected messageHandlers: MessageHandler[] = [];
  protected statusHandlers: StatusHandler[] = [];
  protected logger: ChannelLogger;
  protected options: ChannelInitOptions;

  constructor(
    protected deps: ChannelDependencies,
    options?: ChannelInitOptions,
  ) {
    this.logger = deps.logger;
    this.options = { ...DEFAULT_CHANNEL_INIT_OPTIONS, ...options };
  }

  /**
   * Current connection status
   */
  get status(): ChannelStatus {
    return this._status;
  }

  /**
   * Update status and notify handlers
   */
  protected setStatus(status: ChannelStatus, error?: string): void {
    const previousStatus = this._status;
    this._status = status;

    if (previousStatus !== status) {
      this.logger.info(`Channel ${this.id} status changed: ${previousStatus} -> ${status}`, {
        channelId: this.id,
        previousStatus,
        newStatus: status,
        error,
      });

      // Notify all status handlers
      for (const handler of this.statusHandlers) {
        try {
          handler(status, error);
        } catch (err) {
          this.logger.error('Error in status handler', {
            channelId: this.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Emit socket event
      this.deps.emitEvent('channel_status', {
        channelId: this.id,
        status,
        error,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this._status === 'connected';
  }

  /**
   * Register handler for incoming messages
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Unregister a message handler to prevent memory leaks
   */
  offMessage(handler: MessageHandler): void {
    const index = this.messageHandlers.indexOf(handler);
    if (index !== -1) {
      this.messageHandlers.splice(index, 1);
    }
  }

  /**
   * Register handler for status changes
   */
  onStatusChange(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  /**
   * Unregister a status handler to prevent memory leaks
   */
  offStatusChange(handler: StatusHandler): void {
    const index = this.statusHandlers.indexOf(handler);
    if (index !== -1) {
      this.statusHandlers.splice(index, 1);
    }
  }

  /**
   * Emit message to all registered handlers
   */
  protected async emitMessage(msg: ChannelMessage): Promise<void> {
    this.logger.debug(`Received message on ${this.id}`, {
      channelId: this.id,
      messageId: msg.id,
      contactId: msg.contactId,
    });

    for (const handler of this.messageHandlers) {
      try {
        await handler(msg);
      } catch (err) {
        this.logger.error('Error in message handler', {
          channelId: this.id,
          messageId: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Create a ChannelMessage from raw data
   * Subclasses should use this to ensure consistent message format
   */
  protected createMessage(data: {
    id: string;
    contactId: string;
    content: string;
    timestamp?: number;
    mediaType?: ChannelMessage['mediaType'];
    mediaUrl?: string;
    replyTo?: string;
    metadata?: Record<string, unknown>;
  }): ChannelMessage {
    const normalizedContactId = this.normalizeContactId(data.contactId);

    // Build message object, only including optional fields if they have values
    // This is required for exactOptionalPropertyTypes compliance
    const message: ChannelMessage = {
      id: data.id,
      version: 2,
      channelId: this.id,
      contactId: data.contactId,
      content: data.content,
      timestamp: data.timestamp ?? Date.now(),
    };

    // Conditionally add optional fields
    if (normalizedContactId !== null) {
      message.normalizedContactId = normalizedContactId;
    }
    if (data.mediaType !== undefined) {
      message.mediaType = data.mediaType;
    }
    if (data.mediaUrl !== undefined) {
      message.mediaUrl = data.mediaUrl;
    }
    if (data.replyTo !== undefined) {
      message.replyTo = data.replyTo;
    }
    if (data.metadata !== undefined) {
      message.metadata = data.metadata;
    }

    return message;
  }

  // Abstract methods that subclasses must implement

  /**
   * Connect to the channel service
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the channel service
   */
  abstract disconnect(): Promise<void>;

  /**
   * Send a message to a contact
   */
  abstract sendMessage(to: string, content: MessageContent): Promise<SendResult>;

  /**
   * Show typing indicator to a contact
   */
  abstract sendTypingIndicator(to: string, durationMs?: number): Promise<void>;

  /**
   * Get all contacts from this channel
   */
  abstract getContacts(): Promise<ChannelContact[]>;

  /**
   * Get a specific contact by ID
   */
  abstract getContact(id: string): Promise<ChannelContact | null>;

  /**
   * Extract normalized phone number from channel-specific contact ID
   * Returns null if the contact ID doesn't contain a phone number
   */
  abstract normalizeContactId(contactId: string): string | null;
}
