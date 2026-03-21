/**
 * Telegram Channel Adapter
 * Implements the Channel interface using grammY for Telegram bot integration.
 *
 * This adapter uses Telegram's long polling mechanism for receiving messages
 * and the Bot API for sending messages.
 */

import { Bot, InputFile, type Context } from 'grammy';
import { BaseChannel } from '../base-channel.js';
import type { MessageContent, SendResult, ChannelContact, DownloadedMedia } from '@secondme/shared-types';
import type { ChannelDependencies, ChannelInitOptions } from '../types.js';
import { normalizeTelegramContactId, isTelegramGroup } from './normalizer.js';
import { getErrorMessage } from '../utils.js';

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
/**
 * Default retry configuration for media downloads
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Retry configuration for API message sending (handles 429 rate limits)
 */
const MESSAGE_RETRY_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * MIME type lookup table for Telegram file paths (L7: hoisted from getMimeTypeFromPath)
 */
const MIME_TYPES: Record<string, string> = {
  // Audio
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  // Image
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  // Document
  pdf: 'application/pdf',
};

export class TelegramChannel extends BaseChannel {
  readonly id = 'telegram' as const;
  readonly displayName = 'Telegram';
  readonly icon = 'telegram';

  private bot: Bot<Context>;
  private config: Required<TelegramChannelConfig>;
  private pollingPromise: Promise<void> | null = null;

  private contactCache = new Map<string, ChannelContact>();
  private static readonly MAX_CACHE_SIZE = 1000;

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

    // Evict oldest entry if cache is full
    if (this.contactCache.size >= TelegramChannel.MAX_CACHE_SIZE) {
      const firstKey = this.contactCache.keys().next().value;
      if (firstKey) this.contactCache.delete(firstKey);
    }

    this.contactCache.set(contactId, contact);
  }

  /**
   * Shared handler for all incoming message types (M7).
   * Applies the group-skip guard, caches the contact, then delegates
   * message parameter construction to the caller-supplied extractor
   * before emitting the normalised message.
   *
   * @param ctx - grammY context for the incoming update
   * @param extractor - callback that returns createMessage() parameters from ctx
   */
  private async handleIncomingMessage(
    ctx: Context,
    extractor: (ctx: Context) => Parameters<typeof this.createMessage>[0] | null
  ): Promise<void> {
    if (this.config.skipGroups && ctx.chat && isTelegramGroup(ctx.chat.type)) {
      return;
    }

    this.cacheContact(ctx);

    const params = extractor(ctx);
    if (params === null) {
      return;
    }

    const message = this.createMessage(params);
    await this.emitMessage(message);
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
    this.bot.on('message:text', (ctx) =>
      this.handleIncomingMessage(ctx, (c) => ({
        id: c.message!.message_id.toString(),
        contactId: normalizeTelegramContactId(c.from!.id),
        content: (c.message as NonNullable<typeof c.message> & { text: string }).text,
        timestamp: c.message!.date * 1000, // Convert to milliseconds
        metadata: {
          chatId: c.chat!.id,
          firstName: c.from!.first_name,
          lastName: c.from!.last_name,
          username: c.from!.username,
        },
      }))
    );

    // Handle photo messages
    this.bot.on('message:photo', (ctx) =>
      this.handleIncomingMessage(ctx, (c) => {
        const photos = (c.message as NonNullable<typeof c.message> & { photo: { file_id: string }[] }).photo;
        const largestPhoto = photos[photos.length - 1];
        if (!largestPhoto) return null;
        const msg = c.message as NonNullable<typeof c.message> & { caption?: string; photo: { file_id: string }[] };
        return {
          id: c.message!.message_id.toString(),
          contactId: normalizeTelegramContactId(c.from!.id),
          content: msg.caption || '[Photo]',
          timestamp: c.message!.date * 1000,
          mediaType: 'image' as const,
          mediaUrl: largestPhoto.file_id, // Telegram file_id for later retrieval
          metadata: {
            chatId: c.chat!.id,
            firstName: c.from!.first_name,
            lastName: c.from!.last_name,
            username: c.from!.username,
          },
        };
      })
    );

    // Handle voice messages
    this.bot.on('message:voice', (ctx) =>
      this.handleIncomingMessage(ctx, (c) => {
        const voice = (c.message as NonNullable<typeof c.message> & { voice: { file_id: string; duration: number } }).voice;
        return {
          id: c.message!.message_id.toString(),
          contactId: normalizeTelegramContactId(c.from!.id),
          content: '[Voice message]',
          timestamp: c.message!.date * 1000,
          mediaType: 'audio' as const,
          mediaUrl: voice.file_id,
          metadata: {
            chatId: c.chat!.id,
            firstName: c.from!.first_name,
            duration: voice.duration,
          },
        };
      })
    );

    // Handle document messages
    this.bot.on('message:document', (ctx) =>
      this.handleIncomingMessage(ctx, (c) => {
        const doc = (c.message as NonNullable<typeof c.message> & { document: { file_id: string; file_name?: string; mime_type?: string }; caption?: string }).document;
        const caption = (c.message as NonNullable<typeof c.message> & { caption?: string }).caption;
        return {
          id: c.message!.message_id.toString(),
          contactId: normalizeTelegramContactId(c.from!.id),
          content: caption || `[Document: ${doc.file_name || 'file'}]`,
          timestamp: c.message!.date * 1000,
          mediaType: 'document' as const,
          mediaUrl: doc.file_id,
          metadata: {
            chatId: c.chat!.id,
            firstName: c.from!.first_name,
            fileName: doc.file_name,
            mimeType: doc.mime_type,
          },
        };
      })
    );

    // Handle video messages
    this.bot.on('message:video', (ctx) =>
      this.handleIncomingMessage(ctx, (c) => {
        const video = (c.message as NonNullable<typeof c.message> & { video: { file_id: string; duration: number; width: number; height: number }; caption?: string }).video;
        const caption = (c.message as NonNullable<typeof c.message> & { caption?: string }).caption;
        return {
          id: c.message!.message_id.toString(),
          contactId: normalizeTelegramContactId(c.from!.id),
          content: caption || '[Video]',
          timestamp: c.message!.date * 1000,
          mediaType: 'video' as const,
          mediaUrl: video.file_id,
          metadata: {
            chatId: c.chat!.id,
            firstName: c.from!.first_name,
            lastName: c.from!.last_name,
            username: c.from!.username,
            duration: video.duration,
            width: video.width,
            height: video.height,
          },
        };
      })
    );

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
        const message = getErrorMessage(error);
        this.logger.error('Telegram bot polling error', {
          channelId: this.id,
          error: message,
        });
        this.setStatus('error', message);
      });
    } catch (error) {
      const message = getErrorMessage(error);
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
        error: getErrorMessage(error),
      });
      // Still mark as disconnected
      this.contactCache.clear();
      this.setStatus('disconnected');
    }
  }

  /**
   * Send a message to a Telegram user with retry logic for rate limits
   */
  async sendMessage(to: string, content: MessageContent): Promise<SendResult> {
    if (!content.text) {
      return { success: false, error: 'No text content' };
    }

    try {
      const chatId = this.extractChatId(to);
      return this.sendMessageWithRetry(chatId, content.text, to, 0);
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Generic retry wrapper for send operations (M8).
   * Delegates retry scheduling to retryMessageSend when the error is
   * a 429 rate-limit or another retryable network failure.
   *
   * @param operation - factory that produces the next attempt's promise
   * @param attempt - zero-based current attempt index
   * @param operationType - label used in log messages (e.g. 'sendMessage')
   * @param to - contact ID used in log messages
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    attempt: number,
    operationType: string,
    to: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const isRetryable =
        (this.is429Error(error) || this.isRetryableError(error)) &&
        attempt < MESSAGE_RETRY_CONFIG.maxRetries;

      if (isRetryable) {
        return this.retryMessageSend(
          () => this.withRetry(operation, attempt + 1, operationType, to),
          error,
          attempt,
          operationType,
          to
        );
      }

      throw error;
    }
  }

  /**
   * Internal method with retry logic for message sending
   */
  private async sendMessageWithRetry(
    chatId: number,
    text: string,
    to: string,
    attempt: number
  ): Promise<SendResult> {
    try {
      const result = await this.withRetry<{ message_id: number }>(
        () => this.bot.api.sendMessage(chatId, text),
        attempt,
        'sendMessage',
        to
      );
      return { success: true, messageId: result.message_id.toString() };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      this.logger.error('Failed to send Telegram message', {
        channelId: this.id,
        to,
        error: errorMsg,
        attempt: attempt + 1,
      });
      return { success: false, error: errorMsg };
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
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Send a voice message to a Telegram user with retry logic for rate limits
   * Phase 5: TTS voice response
   *
   * @param to - Contact ID to send to (tg_{userId} format)
   * @param audio - Audio data with base64 content and mimeType
   * @returns SendResult indicating success/failure
   */
  async sendVoice(
    to: string,
    audio: { base64: string; mimeType: string }
  ): Promise<SendResult> {
    try {
      const chatId = this.extractChatId(to);

      // Convert base64 to Buffer
      const buffer = Buffer.from(audio.base64, 'base64');

      // Match filename extension to actual MIME type
      const ext = audio.mimeType === 'audio/mpeg' ? 'mp3' : 'ogg';

      return this.sendVoiceWithRetry(chatId, buffer, ext, to, 0);
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Internal method with retry logic for voice message sending
   */
  private async sendVoiceWithRetry(
    chatId: number,
    buffer: Buffer,
    ext: string,
    to: string,
    attempt: number
  ): Promise<SendResult> {
    try {
      // InputFile is recreated inside the operation lambda on each attempt
      // to avoid stream-reuse issues.
      const result = await this.withRetry<{ message_id: number }>(
        () => this.bot.api.sendVoice(chatId, new InputFile(buffer, `voice.${ext}`)),
        attempt,
        'sendVoice',
        to
      );

      this.logger.info('Voice message sent', {
        channelId: this.id,
        to,
        messageId: result.message_id.toString(),
        attempts: attempt + 1,
      });

      return { success: true, messageId: result.message_id.toString() };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      this.logger.error('Failed to send Telegram voice message', {
        channelId: this.id,
        to,
        error: errorMsg,
        attempt: attempt + 1,
      });
      return { success: false, error: errorMsg };
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

  // --- Media Methods ---

  /**
   * Download media from Telegram using file_id with retry logic
   * Telegram provides file_id which can be used to download via Bot API
   *
   * @param fileId - The Telegram file_id
   * @returns Downloaded media with base64 data and mime type, or null if download fails
   */
  async downloadMedia(fileId: string): Promise<DownloadedMedia | null> {
    return this.downloadMediaWithRetry(fileId, 0);
  }

  /**
   * Internal method with retry logic for media download
   */
  private async downloadMediaWithRetry(
    fileId: string,
    attempt: number
  ): Promise<DownloadedMedia | null> {
    try {
      // Get file info from Telegram
      const file = await this.bot.api.getFile(fileId);

      if (!file.file_path) {
        this.logger.warn('No file_path in Telegram file response', {
          channelId: this.id,
          fileId,
        });
        return null;
      }

      // Download the file from Telegram servers
      const url = `https://api.telegram.org/file/bot${this.config.botToken}/${file.file_path}`;

      const response = await fetch(url);
      if (!response.ok) {
        // Check if retryable status code
        if (this.isRetryableStatusCode(response.status) && attempt < DEFAULT_RETRY_CONFIG.maxRetries) {
          return this.retryDownload(fileId, attempt, `HTTP ${response.status}`);
        }

        this.logger.error('Failed to download Telegram file', {
          channelId: this.id,
          fileId,
          status: response.status,
          attempt: attempt + 1,
        });
        return null;
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      // Determine MIME type from file path
      const mimeType = this.getMimeTypeFromPath(file.file_path);
      const sizeBytes = buffer.byteLength;

      this.logger.info('Media downloaded successfully', {
        channelId: this.id,
        fileId,
        mimeType,
        sizeKB: Math.round(sizeBytes / 1024),
        attempts: attempt + 1,
      });

      return {
        base64,
        mimeType,
        sizeBytes,
      };
    } catch (error) {
      // Check if error is retryable (network errors, timeouts)
      if (this.isRetryableError(error) && attempt < DEFAULT_RETRY_CONFIG.maxRetries) {
        return this.retryDownload(
          fileId,
          attempt,
          getErrorMessage(error)
        );
      }

      this.logger.error('Failed to download Telegram media', {
        channelId: this.id,
        fileId,
        error: getErrorMessage(error),
        attempt: attempt + 1,
      });
      return null;
    }
  }

  /**
   * Retry media download with exponential backoff
   */
  private async retryDownload(
    fileId: string,
    currentAttempt: number,
    reason: string
  ): Promise<DownloadedMedia | null> {
    const nextAttempt = currentAttempt + 1;
    const delay = Math.min(
      DEFAULT_RETRY_CONFIG.initialDelayMs *
        Math.pow(DEFAULT_RETRY_CONFIG.backoffMultiplier, currentAttempt),
      DEFAULT_RETRY_CONFIG.maxDelayMs
    );

    this.logger.warn('Retrying Telegram media download', {
      channelId: this.id,
      fileId,
      attempt: nextAttempt,
      maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
      delayMs: delay,
      reason,
    });

    await this.sleep(delay);
    return this.downloadMediaWithRetry(fileId, nextAttempt);
  }

  /**
   * Check if HTTP status code is retryable
   */
  private isRetryableStatusCode(status: number): boolean {
    // Retry on server errors (5xx) and rate limiting (429)
    return status >= 500 || status === 429;
  }

  /**
   * Check if error is a Telegram 429 (Too Many Requests) rate limit error
   */
  private is429Error(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('429') || error.message.toLowerCase().includes('too many requests');
    }
    return false;
  }

  /**
   * Extract retry_after value from Telegram 429 error
   * Telegram error format: "429 Too Many Requests: retry_after=30"
   */
  private extractRetryAfter(error: unknown): number | undefined {
    if (error instanceof Error) {
      const match = error.message.match(/retry_after[=:]?\s*(\d+)/i);
      if (match?.[1]) {
        return parseInt(match[1], 10) * 1000; // Convert seconds to milliseconds
      }
    }
    return undefined;
  }

  /**
   * Retry message send operation with exponential backoff
   * Respects retry_after for 429 errors
   */
  private async retryMessageSend<T>(
    operation: () => Promise<T>,
    error: unknown,
    currentAttempt: number,
    operationType: string,
    to: string
  ): Promise<T> {
    const nextAttempt = currentAttempt + 1;

    // For 429 errors, prefer the retry_after value from Telegram
    let delay = this.extractRetryAfter(error);

    // If no retry_after, use exponential backoff
    if (delay === undefined) {
      delay = Math.min(
        MESSAGE_RETRY_CONFIG.initialDelayMs *
          Math.pow(MESSAGE_RETRY_CONFIG.backoffMultiplier, currentAttempt),
        MESSAGE_RETRY_CONFIG.maxDelayMs
      );
    }

    // Add jitter (±25%) to prevent thundering herd when multiple requests retry
    const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
    delay = Math.round(delay * jitterFactor);

    this.logger.warn(`Retrying Telegram ${operationType}`, {
      channelId: this.id,
      to,
      attempt: nextAttempt,
      maxRetries: MESSAGE_RETRY_CONFIG.maxRetries,
      delayMs: delay,
      reason: getErrorMessage(error),
      is429: this.is429Error(error),
    });

    await this.sleep(delay);
    return operation();
  }

  /**
   * Check if error is retryable (network issues, timeouts)
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('socket hang up') ||
        message.includes('fetch failed')
      );
    }
    return false;
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Determine MIME type from Telegram file path.
   * Uses the module-level MIME_TYPES constant (L7).
   */
  private getMimeTypeFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    return MIME_TYPES[ext || ''] || 'application/octet-stream';
  }

  // --- Private Methods ---

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
