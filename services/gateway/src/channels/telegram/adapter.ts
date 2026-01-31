/**
 * Telegram Channel Adapter
 * Implements the Channel interface using grammY for Telegram bot integration.
 *
 * This adapter uses Telegram's long polling mechanism for receiving messages
 * and the Bot API for sending messages.
 */

import { Bot, type Context } from 'grammy';
import { BaseChannel } from '../base-channel.js';
import type { MessageContent, SendResult, ChannelContact } from '@secondme/shared-types';
import type { ChannelDependencies, ChannelInitOptions } from '../types.js';
import { normalizeTelegramContactId, isTelegramGroup } from './normalizer.js';

/**
 * Configuration options for Telegram channel behavior
 */
export interface TelegramChannelConfig {
  /** Telegram bot token from @BotFather */
  botToken: string;
  /** Whether to skip messages from group chats (default: true) */
  skipGroups?: boolean;
}

/**
 * Dependencies for Telegram channel adapter
 */
export interface TelegramChannelDeps extends ChannelDependencies {
  /** Optional channel behavior configuration */
  config?: TelegramChannelConfig;
}

/**
 * Telegram Channel Adapter
 * Implements the Channel interface for Telegram messaging.
 */
export class TelegramChannel extends BaseChannel {
  readonly id = 'telegram' as const;
  readonly displayName = 'Telegram';
  readonly icon = 'telegram';

  private bot: Bot<Context>;
  private config: Required<TelegramChannelConfig>;
  private pollingPromise: Promise<void> | null = null;

  private contactCache = new Map<string, ChannelContact>();

  constructor(
    deps: TelegramChannelDeps,
    config: TelegramChannelConfig,
    options?: ChannelInitOptions
  ) {
    super(deps, options);

    // Validate token format (must contain ':')
    if (!config.botToken || !config.botToken.includes(':')) {
      throw new Error(
        'Invalid Telegram bot token format. Token should be in format: 123456789:ABCdefGHI...'
      );
    }

    this.config = {
      botToken: config.botToken,
      skipGroups: config.skipGroups ?? true,
    };
    this.bot = new Bot(this.config.botToken);
    this.setupBotHandlers();
  }

  /**
   * Cache contact information from incoming message context
   */
  private cacheContact(ctx: Context): void {
    if (!ctx.from) return;

    const contactId = normalizeTelegramContactId(ctx.from.id);
    const contact: ChannelContact = {
      id: contactId,
      channelId: this.id,
      displayName: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ''),
    };

    this.contactCache.set(contactId, contact);
  }

  /**
   * Set up message and command handlers on the bot
   */
  private setupBotHandlers(): void {
    // Handle /start command
    this.bot.command('start', async (ctx) => {
      await ctx.reply('Welcome! I am an AI assistant. Send me a message to get started.');
    });

    // Handle text messages
    this.bot.on('message:text', async (ctx) => {
      // Skip groups if configured
      if (this.config.skipGroups && isTelegramGroup(ctx.chat.type)) {
        return;
      }

      // Cache contact info
      this.cacheContact(ctx);

      // Create normalized message using BaseChannel helper
      const message = this.createMessage({
        id: ctx.message.message_id.toString(),
        contactId: normalizeTelegramContactId(ctx.from.id),
        content: ctx.message.text,
        timestamp: ctx.message.date * 1000, // Convert to milliseconds
        metadata: {
          chatId: ctx.chat.id,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
        },
      });

      await this.emitMessage(message);
    });

    // Handle photo messages
    this.bot.on('message:photo', async (ctx) => {
      if (this.config.skipGroups && isTelegramGroup(ctx.chat.type)) {
        return;
      }

      // Cache contact info
      this.cacheContact(ctx);

      const photos = ctx.message.photo;
      // Photos array is always non-empty for message:photo events
      // Get the largest (last) photo
      const largestPhoto = photos[photos.length - 1];
      if (!largestPhoto) {
        return;
      }

      const message = this.createMessage({
        id: ctx.message.message_id.toString(),
        contactId: normalizeTelegramContactId(ctx.from.id),
        content: ctx.message.caption || '[Photo]',
        timestamp: ctx.message.date * 1000,
        mediaType: 'image',
        mediaUrl: largestPhoto.file_id, // Telegram file_id for later retrieval
        metadata: {
          chatId: ctx.chat.id,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
        },
      });

      await this.emitMessage(message);
    });

    // Handle voice messages
    this.bot.on('message:voice', async (ctx) => {
      if (this.config.skipGroups && isTelegramGroup(ctx.chat.type)) {
        return;
      }

      // Cache contact info
      this.cacheContact(ctx);

      const message = this.createMessage({
        id: ctx.message.message_id.toString(),
        contactId: normalizeTelegramContactId(ctx.from.id),
        content: '[Voice message]',
        timestamp: ctx.message.date * 1000,
        mediaType: 'audio',
        mediaUrl: ctx.message.voice.file_id,
        metadata: {
          chatId: ctx.chat.id,
          firstName: ctx.from.first_name,
          duration: ctx.message.voice.duration,
        },
      });

      await this.emitMessage(message);
    });

    // Handle document messages
    this.bot.on('message:document', async (ctx) => {
      if (this.config.skipGroups && isTelegramGroup(ctx.chat.type)) {
        return;
      }

      // Cache contact info
      this.cacheContact(ctx);

      const message = this.createMessage({
        id: ctx.message.message_id.toString(),
        contactId: normalizeTelegramContactId(ctx.from.id),
        content: ctx.message.caption || `[Document: ${ctx.message.document.file_name || 'file'}]`,
        timestamp: ctx.message.date * 1000,
        mediaType: 'document',
        mediaUrl: ctx.message.document.file_id,
        metadata: {
          chatId: ctx.chat.id,
          firstName: ctx.from.first_name,
          fileName: ctx.message.document.file_name,
          mimeType: ctx.message.document.mime_type,
        },
      });

      await this.emitMessage(message);
    });

    // Handle video messages
    this.bot.on('message:video', async (ctx) => {
      if (this.config.skipGroups && isTelegramGroup(ctx.chat.type)) {
        return;
      }

      // Cache contact info
      this.cacheContact(ctx);

      const message = this.createMessage({
        id: ctx.message.message_id.toString(),
        contactId: normalizeTelegramContactId(ctx.from.id),
        content: ctx.message.caption || '[Video]',
        timestamp: ctx.message.date * 1000,
        mediaType: 'video',
        mediaUrl: ctx.message.video.file_id,
        metadata: {
          chatId: ctx.chat.id,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
          duration: ctx.message.video.duration,
          width: ctx.message.video.width,
          height: ctx.message.video.height,
        },
      });

      await this.emitMessage(message);
    });

    // Handle bot errors
    this.bot.catch((err) => {
      this.logger.error('Telegram bot error', {
        error: err.message,
        channelId: this.id,
      });
    });
  }

  /**
   * Connect to Telegram using long polling
   */
  async connect(): Promise<void> {
    try {
      this.setStatus('connecting');

      // bot.start() is blocking - it runs the long polling loop
      // Don't await it - let it run in background
      this.pollingPromise = this.bot.start({
        onStart: (botInfo) => {
          this.logger.info(`Telegram bot @${botInfo.username} started`, {
            channelId: this.id,
            username: botInfo.username,
          });
          this.setStatus('connected');
        },
      });

      // Handle polling errors
      this.pollingPromise.catch((error) => {
        const message = error instanceof Error ? error.message : 'Polling error';
        this.logger.error('Telegram bot polling error', {
          channelId: this.id,
          error: message,
        });
        this.setStatus('error', message);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.setStatus('error', message);
      throw error;
    }
  }

  /**
   * Disconnect from Telegram
   */
  async disconnect(): Promise<void> {
    try {
      await this.bot.stop();
      this.pollingPromise = null;
      this.contactCache.clear();
      this.setStatus('disconnected');
      this.logger.info('Telegram bot stopped', { channelId: this.id });
    } catch (error) {
      this.logger.error('Error stopping Telegram bot', {
        channelId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Still mark as disconnected
      this.contactCache.clear();
      this.setStatus('disconnected');
    }
  }

  /**
   * Send a message to a Telegram user
   */
  async sendMessage(to: string, content: MessageContent): Promise<SendResult> {
    try {
      const chatId = this.extractChatId(to);

      if (content.text) {
        const result = await this.bot.api.sendMessage(chatId, content.text);
        return { success: true, messageId: result.message_id.toString() };
      }

      return { success: false, error: 'No text content' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Send failed';
      this.logger.error('Failed to send Telegram message', {
        channelId: this.id,
        to,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  /**
   * Send typing indicator to a Telegram user
   * Telegram's "typing" action lasts for 5 seconds or until a message is sent
   */
  async sendTypingIndicator(to: string, _durationMs?: number): Promise<void> {
    try {
      const chatId = this.extractChatId(to);
      await this.bot.api.sendChatAction(chatId, 'typing');
    } catch (error) {
      this.logger.debug('Error sending Telegram typing indicator', {
        channelId: this.id,
        to,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get all contacts from Telegram
   * Note: Telegram bots cannot enumerate contacts - they can only interact
   * with users who have started a conversation with the bot.
   */
  async getContacts(): Promise<ChannelContact[]> {
    // Telegram bots cannot enumerate contacts
    return [];
  }

  /**
   * Get a specific contact by ID from the cache
   * Contacts are cached as they send messages to the bot.
   */
  async getContact(id: string): Promise<ChannelContact | null> {
    return this.contactCache.get(id) || null;
  }

  /**
   * Normalize contact ID to phone number for cross-channel linking
   * Note: Telegram users rarely share phone numbers with bots
   */
  normalizeContactId(_contactId: string): string | null {
    // Telegram users don't share phone numbers by default
    return null;
  }

  /**
   * Extract numeric chat ID from normalized contact ID
   */
  private extractChatId(contactId: string): number {
    // Parse from our normalized format: tg_123456
    const match = contactId.match(/^tg_(\d+)$/);
    if (!match || !match[1]) {
      throw new Error(`Invalid Telegram contact ID: ${contactId}`);
    }
    return parseInt(match[1], 10);
  }
}
