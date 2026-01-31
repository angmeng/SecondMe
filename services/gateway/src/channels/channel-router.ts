/**
 * Channel Router
 * Routes incoming messages from all channels to the message processor.
 *
 * Responsibilities:
 * - Set up message handlers on all registered channels
 * - Route incoming messages through the processor
 * - Provide contact name lookup across channels
 * - Detect channel from contact ID format
 * - Route outgoing messages to the correct channel (simple sends only)
 *
 * Note: For outgoing responses with HTS timing, the response consumer
 * continues to use MessageSender directly. This router only handles
 * simple sends without HTS options.
 */

import type { ChannelId, ChannelMessage, MessageContent, SendResult } from '@secondme/shared-types';
import type { ChannelManager } from './channel-manager.js';
import type { GatewayMessageProcessor } from './message-processor.js';
import type { ChannelLogger, MessageHandler } from './types.js';

/**
 * Dependencies for the ChannelRouter
 */
export interface ChannelRouterDeps {
  /** Channel manager for accessing registered channels */
  channelManager: ChannelManager;
  /** Message processor for handling incoming messages */
  messageProcessor: GatewayMessageProcessor;
  /** Logger for router events */
  logger: ChannelLogger;
}

/**
 * Stored handler reference for cleanup
 */
interface HandlerRegistration {
  channelId: ChannelId;
  handler: MessageHandler;
}

/**
 * Channel Router
 * Routes messages between channels and the message processor.
 */
export class ChannelRouter {
  private readonly deps: ChannelRouterDeps;
  private registeredHandlers: HandlerRegistration[] = [];

  constructor(deps: ChannelRouterDeps) {
    this.deps = deps;
  }

  /**
   * Set up message handlers for all registered channels
   * Each channel's incoming messages will be routed to the processor
   */
  setupRoutes(): void {
    const channels = this.deps.channelManager.getAll();

    for (const channel of channels) {
      const handler: MessageHandler = async (msg: ChannelMessage) => {
        await this.handleIncomingMessage(msg);
      };

      // Register handler on channel
      channel.onMessage(handler);

      // Store reference for cleanup
      this.registeredHandlers.push({
        channelId: channel.id,
        handler,
      });

      this.deps.logger.debug(`Route set up for channel: ${channel.id}`, {
        channelId: channel.id,
      });
    }

    this.deps.logger.info(`Routes set up for ${channels.length} channel(s)`, {
      channels: channels.map((c) => c.id),
    });
  }

  /**
   * Remove all registered message handlers
   * Call this before shutdown or when reconfiguring routes
   */
  removeRoutes(): void {
    for (const { channelId, handler } of this.registeredHandlers) {
      const channel = this.deps.channelManager.get(channelId);
      if (channel) {
        channel.offMessage(handler);
      }
    }

    this.deps.logger.info(`Removed ${this.registeredHandlers.length} route(s)`);
    this.registeredHandlers = [];
  }

  /**
   * Handle incoming message from any channel
   * Looks up contact name and routes to processor
   */
  private async handleIncomingMessage(msg: ChannelMessage): Promise<void> {
    const { channelId, contactId } = msg;

    this.deps.logger.debug(`Routing incoming message from ${channelId}`, {
      channelId,
      contactId: this.maskContactId(contactId),
      messageId: msg.id,
    });

    // Get contact name from the channel
    const contactName = await this.getContactName(channelId, contactId);

    // Route to message processor
    try {
      await this.deps.messageProcessor.processMessage(msg, contactName);
    } catch (error) {
      this.deps.logger.error(`Error processing message from ${channelId}`, {
        channelId,
        contactId: this.maskContactId(contactId),
        messageId: msg.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Route simple outgoing message (no HTS timing)
   * Use this for simple sends; response consumer uses MessageSender for HTS
   *
   * @param channelId - Channel to send through
   * @param contactId - Contact to send to
   * @param content - Message content
   * @returns Send result
   */
  async routeOutgoing(
    channelId: ChannelId,
    contactId: string,
    content: MessageContent
  ): Promise<SendResult> {
    const channel = this.deps.channelManager.get(channelId);

    if (!channel) {
      this.deps.logger.error(`Cannot route outgoing: channel not found`, {
        channelId,
        contactId: this.maskContactId(contactId),
      });
      return { success: false, error: `Channel not found: ${channelId}` };
    }

    if (!channel.isConnected()) {
      this.deps.logger.error(`Cannot route outgoing: channel not connected`, {
        channelId,
        contactId: this.maskContactId(contactId),
      });
      return { success: false, error: `Channel not connected: ${channelId}` };
    }

    try {
      const result = await channel.sendMessage(contactId, content);

      if (result.success) {
        this.deps.logger.debug(`Message sent via ${channelId}`, {
          channelId,
          contactId: this.maskContactId(contactId),
          messageId: result.messageId,
        });
      } else {
        this.deps.logger.error(`Failed to send message via ${channelId}`, {
          channelId,
          contactId: this.maskContactId(contactId),
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.deps.logger.error(`Error sending message via ${channelId}`, {
        channelId,
        contactId: this.maskContactId(contactId),
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get contact name from appropriate channel
   * @param channelId - Channel to look up contact on
   * @param contactId - Contact ID to look up
   * @returns Contact display name or "Unknown"
   */
  async getContactName(channelId: ChannelId, contactId: string): Promise<string> {
    const channel = this.deps.channelManager.get(channelId);

    if (!channel) {
      return 'Unknown';
    }

    try {
      const contact = await channel.getContact(contactId);
      if (contact?.displayName) {
        return contact.displayName;
      }
    } catch (error) {
      this.deps.logger.debug(`Failed to get contact name from ${channelId}`, {
        channelId,
        contactId: this.maskContactId(contactId),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return 'Unknown';
  }

  /**
   * Detect channel from contact ID format
   * Used when channelId is not explicitly provided
   *
   * @param contactId - The contact ID to analyze
   * @returns The detected channel ID
   */
  static getChannelFromContactId(contactId: string): ChannelId {
    // WhatsApp formats
    if (contactId.endsWith('@c.us') || contactId.endsWith('@s.whatsapp.net')) {
      return 'whatsapp';
    }

    // Telegram format: tg_{userId}
    if (contactId.startsWith('tg_')) {
      return 'telegram';
    }

    // Discord format (to be implemented)
    // if (contactId.startsWith('discord_')) {
    //   return 'discord';
    // }

    // Default to whatsapp for backwards compatibility
    return 'whatsapp';
  }

  /**
   * Mask contact ID for privacy in logs
   */
  private maskContactId(contactId: string): string {
    const atIndex = contactId.indexOf('@');
    if (atIndex > 0) {
      const phone = contactId.slice(0, atIndex);
      const suffix = contactId.slice(atIndex);
      if (phone.length <= 6) return contactId;
      return phone.slice(0, 4) + '****' + phone.slice(-2) + suffix;
    }
    if (contactId.length <= 6) return contactId;
    return contactId.slice(0, 4) + '****' + contactId.slice(-2);
  }
}
