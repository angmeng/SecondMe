/**
 * Gateway Message Processor
 * Channel-agnostic message processing pipeline
 *
 * Orchestrates the message flow through:
 * 1. Pairing gate (contact approval check)
 * 2. History storage
 * 3. Pause state check
 * 4. Rate limiting
 * 5. Queue submission
 *
 * Extracted from WhatsApp message-handler.ts to support multi-channel architecture.
 */

import type { ChannelMessage, ChannelId, ContactTier, DownloadedMedia } from '@secondme/shared-types';
import { extractPhoneFromContactId, maskContactId, SOCKET_EVENTS, REDIS_EVENTS } from '@secondme/shared-types';
import { DEFAULT_MEDIA_LIMITS } from '@secondme/shared-types';
import type { StoredMessage } from '../redis/history-store.js';
import type { RateLimiter } from './rate-limiter.js';
import type { ChannelLogger } from './types.js';
import { getErrorMessage } from './utils.js';

/**
 * Maximum payload size for Redis queue (in bytes of base64 data)
 * Set conservatively to avoid Redis memory issues
 * Default: 10MB base64 (~7.5MB binary)
 */
const MAX_QUEUE_PAYLOAD_SIZE_BYTES =
  parseInt(process.env['MAX_QUEUE_PAYLOAD_MB'] || '10', 10) * 1024 * 1024;

/**
 * Interface for contact linker operations (optional dependency)
 */
export interface ContactLinkerInterface {
  linkContact(
    channelId: ChannelId,
    contactId: string,
    normalizedPhone: string,
    displayName?: string
  ): Promise<unknown>;
  isApprovedAcrossChannels(
    contactId: string,
    normalizedPhone?: string | null
  ): Promise<{ approved: boolean; tier?: ContactTier; approvedContactId?: string }>;
}

/**
 * Result of processing an incoming message
 */
export interface ProcessResult {
  /** Whether the message was processed (queued or handled) */
  processed: boolean;
  /** Reason if message was not queued */
  reason?: 'unapproved' | 'denied' | 'paused' | 'rate_limited' | 'queued' | 'auto_approved';
  /** Whether a pairing request was created */
  pairingRequest?: boolean;
  /** Whether the contact was auto-approved */
  autoApproved?: boolean;
}

/**
 * Interface for pairing store operations
 */
export interface PairingStoreInterface {
  isApproved(contactId: string): Promise<boolean>;
  isDenied(contactId: string): Promise<boolean>;
  isAutoApproveExistingEnabled(): boolean;
  isAutoReplyUnknownEnabled(): boolean;
  getAutoReplyMessage(): string;
  hasConversationHistory(contactId: string): Promise<boolean>;
  approveContact(
    contactId: string,
    approvedBy: string,
    tier?: string,
    notes?: string
  ): Promise<{ contactId: string }>;
  createPairingRequest(
    contactId: string,
    displayName?: string,
    profilePicUrl?: string,
    channelId?: string,
    firstMessage?: string
  ): Promise<{
    success: boolean;
    reason?: 'already_approved' | 'already_pending' | 'denied_cooldown';
  }>;
}

/**
 * Interface for history store operations
 */
export interface HistoryStoreInterface {
  addMessage(contactId: string, message: StoredMessage): Promise<boolean>;
}

/**
 * Interface for Redis client operations
 */
export interface RedisClientInterface {
  isPaused(contactId: string): Promise<boolean>;
  queueMessage(payload: {
    messageId: string;
    contactId: string;
    contactName: string;
    content: string;
    timestamp: number;
    hasMedia: boolean;
    type: string;
    /** Base64-encoded media content (for voice/image processing) */
    mediaBase64?: string;
    /** MIME type of the media (e.g., 'audio/ogg', 'image/jpeg') */
    mediaMimeType?: string;
  }): Promise<void>;
  publish(channel: string, message: string): Promise<void>;
  client: {
    set(key: string, value: string): Promise<string | null>;
  };
}

/**
 * Dependencies for the message processor
 */
export interface MessageProcessorDeps {
  /** Rate limiter for controlling message frequency */
  rateLimiter: RateLimiter;
  /** Pairing store for contact approval state */
  pairingStore: PairingStoreInterface;
  /** History store for conversation context */
  historyStore: HistoryStoreInterface;
  /** Redis client for state and queuing */
  redisClient: RedisClientInterface;
  /** Logger for processor events */
  logger: ChannelLogger;
  /** Event emitter for socket.io events */
  emitEvent: (event: string, data: unknown) => void;
  /** Optional: send auto-reply to unapproved contacts */
  sendMessage?: (to: string, content: string) => Promise<void>;
  /** Optional: contact linker for cross-channel linking */
  contactLinker?: ContactLinkerInterface;
  /** Optional: download media from a channel using mediaUrl (Phase 4) */
  downloadMedia?: (channelId: ChannelId, mediaUrl: string) => Promise<DownloadedMedia | null>;
}

/**
 * Gateway Message Processor
 * Orchestrates the message processing pipeline with dependency injection
 * for testability and multi-channel support.
 */
export class GatewayMessageProcessor {
  private readonly deps: MessageProcessorDeps;

  constructor(deps: MessageProcessorDeps) {
    this.deps = deps;
  }

  /**
   * Process an incoming message through the pipeline
   *
   * Pipeline:
   * 1. Check pairing gate (is contact approved?)
   * 2. Store in history (if approved)
   * 3. Check pause state
   * 4. Check rate limit
   * 5. Queue for orchestrator
   *
   * @param message - The channel message to process
   * @param contactName - Optional display name of the contact
   * @returns Result indicating how the message was handled
   */
  async processMessage(message: ChannelMessage, contactName?: string): Promise<ProcessResult> {
    const { contactId, channelId, normalizedContactId } = message;

    this.deps.logger.info(`Processing message from ${maskContactId(contactId)}`, {
      contactId: maskContactId(contactId),
      messageId: message.id,
      channelId,
    });

    if (normalizedContactId && this.deps.contactLinker) {
      try {
        await this.deps.contactLinker.linkContact(
          channelId,
          contactId,
          normalizedContactId,
          contactName
        );
        this.deps.logger.debug(`Linked contact ${maskContactId(contactId)} to phone`, {
          contactId: maskContactId(contactId),
          channelId,
        });
      } catch (error) {
        // Log but don't fail - linking is non-critical
        this.deps.logger.warn(`Failed to link contact ${maskContactId(contactId)}`, {
          error: getErrorMessage(error),
        });
      }
    }

    let isApproved = await this.deps.pairingStore.isApproved(contactId);

    if (!isApproved && this.deps.contactLinker) {
      const linkedResult = await this.deps.contactLinker.isApprovedAcrossChannels(
        contactId,
        normalizedContactId
      );

      if (linkedResult.approved) {
        // Auto-approve this contact with the same tier as the linked contact
        this.deps.logger.info(
          `Auto-approving ${maskContactId(contactId)} via linked contact ${linkedResult.approvedContactId}`,
          {
            contactId: maskContactId(contactId),
            channelId,
            linkedContactId: linkedResult.approvedContactId,
            tier: linkedResult.tier,
          }
        );

        await this.deps.pairingStore.approveContact(
          contactId,
          'system:linked',
          linkedResult.tier || 'standard'
        );
        isApproved = true;
      }
    }

    if (!isApproved) {
      return this.handleUnapprovedContact(message, contactName);
    }

    return this.processApprovedMessage(message, contactName);
  }

  /**
   * Execute steps 2-6 of the pipeline for an already-approved contact:
   * store in history, check pause, check rate limit, download media,
   * queue for orchestrator, and emit the message_received event.
   *
   * @param message - The channel message to process
   * @param contactName - Optional display name of the contact
   * @param autoApproved - When true, marks the result as auto_approved instead of queued
   * @returns Result indicating how the message was handled
   */
  private async processApprovedMessage(
    message: ChannelMessage,
    contactName?: string,
    autoApproved = false
  ): Promise<ProcessResult> {
    const { contactId, content, id: messageId, timestamp, channelId } = message;

    await this.deps.historyStore.addMessage(contactId, {
      id: messageId,
      role: 'user',
      content,
      timestamp,
      type: 'incoming',
    });

    const isPaused = await this.deps.redisClient.isPaused(contactId);
    if (isPaused) {
      this.deps.logger.info(`Contact ${maskContactId(contactId)} is paused, skipping`, {
        contactId: maskContactId(contactId),
        channelId,
      });
      return { processed: true, reason: 'paused', ...(autoApproved && { autoApproved: true }) };
    }

    const rateLimitResult = await this.deps.rateLimiter.check(contactId, { channelId });
    if (!rateLimitResult.allowed) {
      this.deps.logger.info(
        `Rate limit exceeded for ${maskContactId(contactId)}, auto-paused`,
        {
          contactId: maskContactId(contactId),
          channelId,
          count: rateLimitResult.currentCount,
          threshold: rateLimitResult.threshold,
        }
      );
      return {
        processed: true,
        reason: 'rate_limited',
        ...(autoApproved && { autoApproved: true }),
      };
    }

    let mediaBase64: string | undefined;
    let mediaMimeType: string | undefined;

    const hasMedia = message.mediaType !== undefined && message.mediaType !== 'text';
    if (hasMedia && message.mediaUrl && this.deps.downloadMedia) {
      try {
        const downloaded = await this.deps.downloadMedia(channelId, message.mediaUrl);
        if (downloaded) {
          // Size validation: check if media is too large for queue
          const estimatedPayloadSize = downloaded.base64.length;
          if (estimatedPayloadSize > MAX_QUEUE_PAYLOAD_SIZE_BYTES) {
            this.deps.logger.warn(
              `Media too large to queue for ${maskContactId(contactId)}, skipping media`,
              {
                contactId: maskContactId(contactId),
                channelId,
                mediaType: message.mediaType,
                sizeMB: Math.round(estimatedPayloadSize / 1024 / 1024),
                limitMB: Math.round(MAX_QUEUE_PAYLOAD_SIZE_BYTES / 1024 / 1024),
              }
            );
            // Don't include media in payload, but continue processing message
          } else if (
            downloaded.sizeBytes &&
            downloaded.sizeBytes > DEFAULT_MEDIA_LIMITS.maxFileSizeBytes
          ) {
            // Also check against Whisper/Claude limits
            this.deps.logger.warn(
              `Media exceeds processing limits for ${maskContactId(contactId)}, skipping media`,
              {
                contactId: maskContactId(contactId),
                channelId,
                mediaType: message.mediaType,
                sizeMB: Math.round(downloaded.sizeBytes / 1024 / 1024),
                limitMB: Math.round(DEFAULT_MEDIA_LIMITS.maxFileSizeBytes / 1024 / 1024),
              }
            );
          } else {
            mediaBase64 = downloaded.base64;
            mediaMimeType = downloaded.mimeType;
            this.deps.logger.info(`Downloaded media for ${maskContactId(contactId)}`, {
              contactId: maskContactId(contactId),
              channelId,
              mediaType: message.mediaType,
              sizeKB: downloaded.sizeBytes ? Math.round(downloaded.sizeBytes / 1024) : 'unknown',
            });
          }
        }
      } catch (error) {
        // Log but don't fail - message can still be processed without media
        this.deps.logger.warn(`Failed to download media for ${maskContactId(contactId)}`, {
          contactId: maskContactId(contactId),
          channelId,
          error: getErrorMessage(error),
        });
      }
    }

    // Build payload with only defined optional fields (exactOptionalPropertyTypes compliance)
    const messagePayload: Parameters<RedisClientInterface['queueMessage']>[0] = {
      messageId,
      contactId,
      contactName: contactName || 'Unknown',
      content,
      timestamp,
      hasMedia,
      type: message.mediaType || 'text',
    };

    // Only add media fields if they exist
    if (mediaBase64) {
      messagePayload.mediaBase64 = mediaBase64;
    }
    if (mediaMimeType) {
      messagePayload.mediaMimeType = mediaMimeType;
    }

    await this.deps.redisClient.queueMessage(messagePayload);

    this.deps.logger.info(`Message queued for processing: ${messageId}`, {
      contactId: maskContactId(contactId),
      messageId,
      channelId,
    });

    // Emit event for real-time monitoring
    this.deps.emitEvent(SOCKET_EVENTS.MESSAGE_RECEIVED, {
      channelId,
      contactId,
      contactName: contactName || 'Unknown',
      timestamp,
      preview: content.substring(0, 50),
    });

    return autoApproved
      ? { processed: true, reason: 'auto_approved', autoApproved: true }
      : { processed: true, reason: 'queued' };
  }

  /**
   * Handle fromMe messages (user sent message manually)
   * Auto-pause bot indefinitely when user intervenes
   *
   * @param contactId - The contact ID the message was sent to
   * @param messageId - The message ID
   * @param content - The message content
   * @param channelId - Optional channel ID
   */
  async handleFromMe(
    contactId: string,
    messageId: string,
    content: string,
    channelId?: string
  ): Promise<void> {
    const timestamp = Date.now();

    this.deps.logger.info(`fromMe message detected to ${maskContactId(contactId)}`, {
      contactId: maskContactId(contactId),
      messageId,
      channelId,
    });

    await this.deps.historyStore.addMessage(contactId, {
      id: messageId,
      role: 'assistant',
      content,
      timestamp,
      type: 'fromMe',
    });

    const pausedAt = Date.now();

    await this.deps.redisClient.client.set(
      `PAUSE:${contactId}`,
      JSON.stringify({ pausedAt, reason: 'fromMe' })
    );

    // Publish pause event
    await this.deps.redisClient.publish(
      REDIS_EVENTS.PAUSE,
      JSON.stringify({
        contactId,
        channelId,
        action: 'pause',
        reason: 'fromMe',
        pausedAt,
        timestamp: Date.now(),
      })
    );

    this.deps.logger.info(
      `Auto-pause triggered for ${maskContactId(contactId)} (indefinite) due to fromMe`,
      {
        contactId: maskContactId(contactId),
        channelId,
        pausedAt,
      }
    );

    // Emit to frontend for real-time UI update
    this.deps.emitEvent(SOCKET_EVENTS.PAUSE_UPDATE, {
      channelId,
      contactId,
      action: 'pause',
      reason: 'fromMe',
      pausedAt,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle unapproved contact - auto-approve if existing or store as pending
   *
   * Flow:
   * 1. Check if denied (cooling off period) -> ignore
   * 2. Check if auto-approve enabled AND has history -> auto-approve
   * 3. Otherwise store as pending for admin review
   */
  private async handleUnapprovedContact(
    message: ChannelMessage,
    contactName?: string
  ): Promise<ProcessResult> {
    const { contactId, content, channelId } = message;

    const isDenied = await this.deps.pairingStore.isDenied(contactId);
    if (isDenied) {
      this.deps.logger.info(`Contact ${maskContactId(contactId)} is denied, ignoring`, {
        contactId: maskContactId(contactId),
        channelId,
      });
      return { processed: true, reason: 'denied' };
    }

    // Check if auto-approve existing contacts is enabled
    if (this.deps.pairingStore.isAutoApproveExistingEnabled()) {
      const hasHistory = await this.deps.pairingStore.hasConversationHistory(contactId);

      if (hasHistory) {
        this.deps.logger.info(
          `Auto-approving existing contact ${maskContactId(contactId)} (has history)`,
          {
            contactId: maskContactId(contactId),
            channelId,
          }
        );

        // Auto-approve with 'standard' tier
        await this.deps.pairingStore.approveContact(contactId, 'system:auto-approve', 'standard');

        // Run steps 2-6 of the pipeline and return with autoApproved flag
        return this.processApprovedMessage(message, contactName, true);
      }
    }

    // No existing history or auto-approve disabled -> store as pending
    const phoneNumber = extractPhoneFromContactId(contactId);

    const result = await this.deps.pairingStore.createPairingRequest(
      contactId,
      contactName,
      undefined, // profilePicUrl
      channelId,
      content // firstMessage for admin context
    );

    if (result.success) {
      this.deps.logger.info(`Created pending request for ${maskContactId(contactId)}`, {
        contactId: maskContactId(contactId),
        channelId,
      });

      // Emit pairing request event for real-time dashboard update
      this.deps.emitEvent(SOCKET_EVENTS.PAIRING_REQUEST, {
        channelId,
        contactId,
        displayName: contactName,
        phoneNumber,
        firstMessage: content,
        timestamp: Date.now(),
      });

      // Send auto-reply if enabled
      if (this.deps.pairingStore.isAutoReplyUnknownEnabled() && this.deps.sendMessage) {
        try {
          const autoReplyMessage = this.deps.pairingStore.getAutoReplyMessage();
          await this.deps.sendMessage(contactId, autoReplyMessage);
          this.deps.logger.info(`Auto-reply sent to ${maskContactId(contactId)}`, {
            contactId: maskContactId(contactId),
            channelId,
          });
        } catch (error) {
          // Log but don't fail - pending request was already created
          this.deps.logger.error(`Failed to send auto-reply to ${maskContactId(contactId)}`, {
            contactId: maskContactId(contactId),
            channelId,
            error: getErrorMessage(error),
          });
        }
      }

      return { processed: true, reason: 'unapproved', pairingRequest: true };
    } else if (result.reason === 'already_approved') {
      // Race condition - contact was approved between checks
      this.deps.logger.info(
        `Contact ${maskContactId(contactId)} already approved (race condition)`,
        { contactId: maskContactId(contactId), channelId }
      );
      // Re-process as approved
      return this.processMessage(message, contactName);
    } else if (result.reason === 'already_pending') {
      this.deps.logger.info(
        `Contact ${maskContactId(contactId)} already pending (message ignored)`,
        { contactId: maskContactId(contactId), channelId }
      );
      return { processed: true, reason: 'unapproved', pairingRequest: false };
    } else if (result.reason === 'denied_cooldown') {
      this.deps.logger.info(`Contact ${maskContactId(contactId)} is in cooldown period`, {
        contactId: maskContactId(contactId),
        channelId,
      });
      return { processed: true, reason: 'denied' };
    }

    return { processed: true, reason: 'unapproved' };
  }

}
