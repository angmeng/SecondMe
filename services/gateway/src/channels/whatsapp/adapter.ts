/**
 * WhatsApp Channel Adapter
 * Wraps existing WhatsApp client in the Channel interface for multi-channel support.
 *
 * This adapter follows the wrapper pattern - it delegates to the existing
 * WhatsAppClient and MessageSender classes rather than replacing them.
 * This minimizes risk and allows incremental migration.
 *
 * Known Limitations (to be resolved in Task 3.1.2c):
 * - Dual event emission: The existing classes emit events directly to io/redis.
 *   The adapter also emits via BaseChannel. This causes duplicate events temporarily.
 * - Singleton coupling: Uses global whatsappClient singleton, limiting testability.
 */

import type { Client as WWJSClient, Message as WWJSMessage } from 'whatsapp-web.js';
import { BaseChannel } from '../base-channel.js';
import type {
  ChannelMessage,
  MessageContent,
  SendResult,
  ChannelContact,
} from '@secondme/shared-types';
import type { ChannelDependencies, ChannelInitOptions } from '../types.js';
import { normalizeWhatsAppContactId, isGroupChat, isStatusBroadcast } from './normalizer.js';

// Import existing WhatsApp singleton and classes
// These are dynamically imported to allow for testing with mocks
import { whatsappClient } from '../../whatsapp/client.js';
import { MessageSender } from '../../whatsapp/sender.js';

/**
 * Configuration options for WhatsApp channel behavior
 */
export interface WhatsAppChannelConfig {
  /** Whether to simulate typing before sending messages (default: true) */
  simulateTyping?: boolean;
}

/**
 * Dependencies for WhatsApp channel adapter
 * Extends base dependencies with optional testing overrides
 */
export interface WhatsAppChannelDeps extends ChannelDependencies {
  /** Optional: inject mock whatsappClient wrapper for testing */
  mockWhatsAppClient?: {
    initialize(): Promise<void>;
    destroy(): Promise<void>;
    isReady(): boolean;
    getClient(): WWJSClient;
  };
  /** Optional: channel behavior configuration */
  config?: WhatsAppChannelConfig;
}

/**
 * Interface for the WhatsApp client wrapper (mockable for testing)
 */
interface WhatsAppClientWrapper {
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  isReady(): boolean;
  getClient(): WWJSClient;
}

/**
 * WhatsApp Channel Adapter
 * Implements the Channel interface by wrapping existing WhatsApp code.
 */
/** Default configuration for WhatsApp channel */
const DEFAULT_WHATSAPP_CONFIG: Required<WhatsAppChannelConfig> = {
  simulateTyping: true,
};

export class WhatsAppChannel extends BaseChannel {
  readonly id = 'whatsapp' as const;
  readonly displayName = 'WhatsApp';
  readonly icon = 'whatsapp';

  private messageSender: MessageSender | null = null;
  private wwjsClient: WWJSClient | null = null;
  private readonly clientWrapper: WhatsAppClientWrapper;
  private readonly config: Required<WhatsAppChannelConfig>;

  // Bound event handlers for cleanup
  private boundMessageHandler: ((message: WWJSMessage) => Promise<void>) | null = null;
  private boundReadyHandler: (() => void) | null = null;
  private boundDisconnectedHandler: ((reason: string) => void) | null = null;
  private boundAuthFailureHandler: ((msg: string) => void) | null = null;
  private boundQrHandler: ((qr: string) => void) | null = null;

  // Track typing indicator timeouts for cleanup on disconnect
  private typingTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(deps: WhatsAppChannelDeps, options?: ChannelInitOptions) {
    super(deps, options);
    // Use mock wrapper if provided (for testing), otherwise use singleton
    this.clientWrapper = deps.mockWhatsAppClient ?? whatsappClient;
    // Merge config with defaults
    this.config = { ...DEFAULT_WHATSAPP_CONFIG, ...deps.config };
  }

  // --- Lifecycle Methods ---

  /**
   * Connect to WhatsApp
   * Initializes the WhatsApp client and sets up event handlers
   */
  async connect(): Promise<void> {
    this.setStatus('connecting');

    try {
      // Initialize WhatsApp client
      await this.clientWrapper.initialize();
      this.wwjsClient = this.clientWrapper.getClient();
      this.messageSender = new MessageSender(this.wwjsClient);

      // Set up event handlers
      this.setupEventHandlers();

      // Check if already ready (client may have connected during initialize)
      if (this.clientWrapper.isReady()) {
        this.setStatus('connected');
      }

      this.logger.info('WhatsApp channel initialized', { channelId: this.id });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      this.setStatus('error', errorMsg);
      this.logger.error('Failed to connect WhatsApp channel', {
        channelId: this.id,
        error: errorMsg,
      });
      throw error;
    }
  }

  /**
   * Disconnect from WhatsApp
   * Cleans up event handlers and destroys the client
   */
  async disconnect(): Promise<void> {
    try {
      this.removeEventHandlers();
      this.clearTypingTimeouts();
      await this.clientWrapper.destroy();
      this.wwjsClient = null;
      this.messageSender = null;
      this.setStatus('disconnected');
      this.logger.info('WhatsApp channel disconnected', { channelId: this.id });
    } catch (error) {
      this.logger.error('Error disconnecting WhatsApp', {
        channelId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Still mark as disconnected even if cleanup failed
      this.setStatus('disconnected');
    }
  }

  /**
   * Clear all pending typing indicator timeouts
   */
  private clearTypingTimeouts(): void {
    for (const timeout of this.typingTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.typingTimeouts.clear();
  }

  // --- Messaging Methods ---

  /**
   * Send a message to a contact
   */
  async sendMessage(to: string, content: MessageContent): Promise<SendResult> {
    if (!this.messageSender || !this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    // Extract text from content
    const text = content.text ?? content.media?.caption ?? '';

    if (!text && !content.media) {
      return { success: false, error: 'Message content is empty' };
    }

    try {
      // Use existing MessageSender which handles HTS timing
      const result = await this.messageSender.sendMessage(to, text, {
        simulateTyping: this.config.simulateTyping,
      });

      // Build result with only defined properties (exactOptionalPropertyTypes)
      const sendResult: SendResult = { success: result.success };
      if (result.messageId !== undefined) {
        sendResult.messageId = result.messageId;
      }
      if (result.error !== undefined) {
        sendResult.error = result.error;
      }
      return sendResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Send failed',
      };
    }
  }

  /**
   * Send typing indicator to a contact
   */
  async sendTypingIndicator(to: string, durationMs?: number): Promise<void> {
    if (!this.wwjsClient || !this.isConnected()) return;

    try {
      const chat = await this.wwjsClient.getChatById(to);
      await chat.sendStateTyping();

      if (durationMs && durationMs > 0) {
        // Clear any existing timeout for this contact
        const existingTimeout = this.typingTimeouts.get(to);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Set new timeout and track it for cleanup on disconnect
        const timeout = setTimeout(async () => {
          this.typingTimeouts.delete(to);
          try {
            await chat.clearState();
          } catch {
            // Ignore errors when clearing state (chat might be closed)
          }
        }, durationMs);

        this.typingTimeouts.set(to, timeout);
      }
    } catch (error) {
      this.logger.debug('Failed to send typing indicator', {
        channelId: this.id,
        to,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // --- Contact Methods ---

  /**
   * Get all contacts from WhatsApp
   * Filters out groups and blocked contacts
   */
  async getContacts(): Promise<ChannelContact[]> {
    if (!this.wwjsClient || !this.isConnected()) return [];

    try {
      const contacts = await this.wwjsClient.getContacts();
      return contacts
        .filter((c) => !c.isGroup && !c.isBlocked)
        .map((c) => {
          const contact: ChannelContact = {
            id: c.id._serialized,
            channelId: this.id,
            displayName: c.pushname || c.name || c.number,
          };

          // Only add normalizedId if it exists
          const normalizedId = normalizeWhatsAppContactId(c.id._serialized);
          if (normalizedId !== null) {
            contact.normalizedId = normalizedId;
          }

          return contact;
        });
    } catch (error) {
      this.logger.error('Failed to get contacts', {
        channelId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get a specific contact by ID
   */
  async getContact(id: string): Promise<ChannelContact | null> {
    if (!this.wwjsClient || !this.isConnected()) return null;

    try {
      const contact = await this.wwjsClient.getContactById(id);

      const result: ChannelContact = {
        id: contact.id._serialized,
        channelId: this.id,
        displayName: contact.pushname || contact.name || contact.number,
      };

      // Only add normalizedId if it exists
      const normalizedId = normalizeWhatsAppContactId(id);
      if (normalizedId !== null) {
        result.normalizedId = normalizedId;
      }

      return result;
    } catch (error) {
      this.logger.debug('Failed to get contact', {
        channelId: this.id,
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Normalize contact ID to phone number for cross-channel linking
   */
  normalizeContactId(contactId: string): string | null {
    return normalizeWhatsAppContactId(contactId);
  }

  // --- Private Methods ---

  /**
   * Set up event handlers on the WhatsApp client
   */
  private setupEventHandlers(): void {
    if (!this.wwjsClient) return;

    // Message handler - process incoming messages
    this.boundMessageHandler = async (message: WWJSMessage) => {
      try {
        await this.handleIncomingMessage(message);
      } catch (error) {
        this.logger.error('Error handling incoming message', {
          channelId: this.id,
          messageId: message.id._serialized,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    // Ready handler - connection established
    this.boundReadyHandler = () => {
      this.setStatus('connected');
    };

    // Disconnected handler
    this.boundDisconnectedHandler = (reason: string) => {
      this.setStatus('disconnected');
      this.logger.warn('WhatsApp disconnected', { channelId: this.id, reason });
    };

    // Auth failure handler
    this.boundAuthFailureHandler = (msg: string) => {
      this.setStatus('error', `Auth failed: ${msg}`);
    };

    // QR code handler - emit via base channel events
    this.boundQrHandler = (qr: string) => {
      this.deps.emitEvent('qr_code', {
        channelId: this.id,
        qr,
        timestamp: Date.now(),
      });
    };

    // Register handlers
    this.wwjsClient.on('message', this.boundMessageHandler);
    this.wwjsClient.on('ready', this.boundReadyHandler);
    this.wwjsClient.on('disconnected', this.boundDisconnectedHandler);
    this.wwjsClient.on('auth_failure', this.boundAuthFailureHandler);
    this.wwjsClient.on('qr', this.boundQrHandler);
  }

  /**
   * Remove event handlers to prevent memory leaks
   */
  private removeEventHandlers(): void {
    if (!this.wwjsClient) return;

    if (this.boundMessageHandler) {
      this.wwjsClient.off('message', this.boundMessageHandler);
      this.boundMessageHandler = null;
    }
    if (this.boundReadyHandler) {
      this.wwjsClient.off('ready', this.boundReadyHandler);
      this.boundReadyHandler = null;
    }
    if (this.boundDisconnectedHandler) {
      this.wwjsClient.off('disconnected', this.boundDisconnectedHandler);
      this.boundDisconnectedHandler = null;
    }
    if (this.boundAuthFailureHandler) {
      this.wwjsClient.off('auth_failure', this.boundAuthFailureHandler);
      this.boundAuthFailureHandler = null;
    }
    if (this.boundQrHandler) {
      this.wwjsClient.off('qr', this.boundQrHandler);
      this.boundQrHandler = null;
    }
  }

  /**
   * Handle an incoming WhatsApp message
   * Converts to ChannelMessage format and emits to registered handlers
   *
   * Note: Media URL extraction is not implemented because whatsapp-web.js
   * requires downloading media via message.downloadMedia() which returns
   * base64 data, not a URL. Full media support should be implemented
   * as a separate getMediaContent(messageId) method if needed.
   */
  private async handleIncomingMessage(message: WWJSMessage): Promise<void> {
    // Ignore group messages - bot only operates in individual chats
    if (isGroupChat(message.from)) {
      return;
    }

    // Ignore status broadcasts
    if (isStatusBroadcast(message.from)) {
      return;
    }

    // Ignore own messages (handled by message_create event in original code)
    if (message.fromMe) {
      return;
    }

    // Convert to unified ChannelMessage format
    // Note: mediaUrl is not set because WhatsApp requires downloading media
    // via message.downloadMedia() which returns base64 data, not a URL
    const channelMsg = this.createMessage({
      id: message.id._serialized,
      contactId: message.from,
      content: message.body,
      timestamp: message.timestamp * 1000, // Convert to milliseconds
      mediaType: this.getMediaType(message),
    });

    // Emit to registered message handlers
    await this.emitMessage(channelMsg);
  }

  /**
   * Determine media type from WhatsApp message
   */
  private getMediaType(message: WWJSMessage): ChannelMessage['mediaType'] {
    if (!message.hasMedia) {
      return 'text';
    }

    const type = message.type;
    switch (type) {
      case 'image':
        return 'image';
      case 'video':
        return 'video';
      case 'audio':
      case 'ptt': // Push to talk (voice message)
        return 'audio';
      case 'document':
        return 'document';
      default:
        return 'text';
    }
  }
}
