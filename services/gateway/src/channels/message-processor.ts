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

import type { ChannelMessage, ChannelId, ContactTier } from '@secondme/shared-types';
import type { StoredMessage } from '../redis/history-store.js';
import type { RateLimiter } from './rate-limiter.js';
import type { ChannelLogger } from './types.js';

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
    const { contactId, content, id: messageId, timestamp, channelId, normalizedContactId } = message;

    this.deps.logger.info(`Processing message from ${this.maskContactId(contactId)}`, {
      contactId: this.maskContactId(contactId),
      messageId,
      channelId,
    });

    // STEP 0: Auto-link contact if we have a phone number
    if (normalizedContactId && this.deps.contactLinker) {
      try {
        await this.deps.contactLinker.linkContact(
          channelId,
          contactId,
          normalizedContactId,
          contactName
        );
        this.deps.logger.debug(`Linked contact ${this.maskContactId(contactId)} to phone`, {
          contactId: this.maskContactId(contactId),
          channelId,
        });
      } catch (error) {
        // Log but don't fail - linking is non-critical
        this.deps.logger.warn(`Failed to link contact ${this.maskContactId(contactId)}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // STEP 1: Pairing gate - check if contact is approved
    let isApproved = await this.deps.pairingStore.isApproved(contactId);

    // STEP 1b: If not approved, check if any linked contact is approved
    if (!isApproved && this.deps.contactLinker) {
      const linkedResult = await this.deps.contactLinker.isApprovedAcrossChannels(
        contactId,
        normalizedContactId
      );

      if (linkedResult.approved) {
        // Auto-approve this contact with the same tier as the linked contact
        this.deps.logger.info(
          `Auto-approving ${this.maskContactId(contactId)} via linked contact ${linkedResult.approvedContactId}`,
          {
            contactId: this.maskContactId(contactId),
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

    // STEP 2: Store in history (only for approved contacts)
    await this.deps.historyStore.addMessage(contactId, {
      id: messageId,
      role: 'user',
      content,
      timestamp,
      type: 'incoming',
    });

    // STEP 3: Check pause state
    const isPaused = await this.deps.redisClient.isPaused(contactId);
    if (isPaused) {
      this.deps.logger.info(`Contact ${this.maskContactId(contactId)} is paused, skipping`, {
        contactId: this.maskContactId(contactId),
        channelId,
      });
      return { processed: true, reason: 'paused' };
    }

    // STEP 4: Rate limit check
    const rateLimitResult = await this.deps.rateLimiter.check(contactId, { channelId });
    if (!rateLimitResult.allowed) {
      this.deps.logger.info(
        `Rate limit exceeded for ${this.maskContactId(contactId)}, auto-paused`,
        {
          contactId: this.maskContactId(contactId),
          channelId,
          count: rateLimitResult.currentCount,
          threshold: rateLimitResult.threshold,
        }
      );
      return { processed: true, reason: 'rate_limited' };
    }

    // STEP 5: Queue for orchestrator
    const messagePayload = {
      messageId,
      contactId,
      contactName: contactName || 'Unknown',
      content,
      timestamp,
      hasMedia: message.mediaType !== undefined && message.mediaType !== 'text',
      type: message.mediaType || 'text',
    };

    await this.deps.redisClient.queueMessage(messagePayload);

    this.deps.logger.info(`Message queued for processing: ${messageId}`, {
      contactId: this.maskContactId(contactId),
      messageId,
      channelId,
    });

    // Emit event for real-time monitoring
    this.deps.emitEvent('message_received', {
      channelId,
      contactId,
      contactName: contactName || 'Unknown',
      timestamp,
      preview: content.substring(0, 50),
    });

    return { processed: true, reason: 'queued' };
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

    this.deps.logger.info(`fromMe message detected to ${this.maskContactId(contactId)}`, {
      contactId: this.maskContactId(contactId),
      messageId,
      channelId,
    });

    // Store user's manual message in conversation history
    await this.deps.historyStore.addMessage(contactId, {
      id: messageId,
      role: 'assistant',
      content,
      timestamp,
      type: 'fromMe',
    });

    // Auto-pause bot for this contact (indefinite - no TTL)
    const pausedAt = Date.now();

    await this.deps.redisClient.client.set(
      `PAUSE:${contactId}`,
      JSON.stringify({ pausedAt, reason: 'fromMe' })
    );

    // Publish pause event
    await this.deps.redisClient.publish(
      'events:pause',
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
      `Auto-pause triggered for ${this.maskContactId(contactId)} (indefinite) due to fromMe`,
      {
        contactId: this.maskContactId(contactId),
        channelId,
        pausedAt,
      }
    );

    // Emit to frontend for real-time UI update
    this.deps.emitEvent('pause_update', {
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
    const { contactId, content, id: messageId, timestamp, channelId } = message;

    // Check if denied (cooling off period)
    const isDenied = await this.deps.pairingStore.isDenied(contactId);
    if (isDenied) {
      this.deps.logger.info(`Contact ${this.maskContactId(contactId)} is denied, ignoring`, {
        contactId: this.maskContactId(contactId),
        channelId,
      });
      return { processed: true, reason: 'denied' };
    }

    // Check if auto-approve existing contacts is enabled
    if (this.deps.pairingStore.isAutoApproveExistingEnabled()) {
      const hasHistory = await this.deps.pairingStore.hasConversationHistory(contactId);

      if (hasHistory) {
        this.deps.logger.info(
          `Auto-approving existing contact ${this.maskContactId(contactId)} (has history)`,
          {
            contactId: this.maskContactId(contactId),
            channelId,
          }
        );

        // Auto-approve with 'standard' tier
        await this.deps.pairingStore.approveContact(contactId, 'system:auto-approve', 'standard');

        // Now process the message normally
        // Store in history
        await this.deps.historyStore.addMessage(contactId, {
          id: messageId,
          role: 'user',
          content,
          timestamp,
          type: 'incoming',
        });

        // Check pause state
        const isPaused = await this.deps.redisClient.isPaused(contactId);
        if (isPaused) {
          return { processed: true, reason: 'paused', autoApproved: true };
        }

        // Check rate limit
        const rateLimitResult = await this.deps.rateLimiter.check(contactId, { channelId });
        if (!rateLimitResult.allowed) {
          return { processed: true, reason: 'rate_limited', autoApproved: true };
        }

        // Queue for orchestrator
        await this.deps.redisClient.queueMessage({
          messageId,
          contactId,
          contactName: contactName || 'Unknown',
          content,
          timestamp,
          hasMedia: message.mediaType !== undefined && message.mediaType !== 'text',
          type: message.mediaType || 'text',
        });

        // Emit message received event
        this.deps.emitEvent('message_received', {
          channelId,
          contactId,
          contactName: contactName || 'Unknown',
          timestamp,
          preview: content.substring(0, 50),
        });

        return { processed: true, reason: 'auto_approved', autoApproved: true };
      }
    }

    // No existing history or auto-approve disabled -> store as pending
    const phoneNumber = contactId.replace('@c.us', '').replace('@s.whatsapp.net', '');

    const result = await this.deps.pairingStore.createPairingRequest(
      contactId,
      contactName,
      undefined, // profilePicUrl
      channelId,
      content // firstMessage for admin context
    );

    if (result.success) {
      this.deps.logger.info(`Created pending request for ${this.maskContactId(contactId)}`, {
        contactId: this.maskContactId(contactId),
        channelId,
      });

      // Emit pairing request event for real-time dashboard update
      this.deps.emitEvent('pairing_request', {
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
          this.deps.logger.info(`Auto-reply sent to ${this.maskContactId(contactId)}`, {
            contactId: this.maskContactId(contactId),
            channelId,
          });
        } catch (error) {
          // Log but don't fail - pending request was already created
          this.deps.logger.error(`Failed to send auto-reply to ${this.maskContactId(contactId)}`, {
            contactId: this.maskContactId(contactId),
            channelId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return { processed: true, reason: 'unapproved', pairingRequest: true };
    } else if (result.reason === 'already_approved') {
      // Race condition - contact was approved between checks
      this.deps.logger.info(
        `Contact ${this.maskContactId(contactId)} already approved (race condition)`,
        { contactId: this.maskContactId(contactId), channelId }
      );
      // Re-process as approved
      return this.processMessage(message, contactName);
    } else if (result.reason === 'already_pending') {
      this.deps.logger.info(
        `Contact ${this.maskContactId(contactId)} already pending (message ignored)`,
        { contactId: this.maskContactId(contactId), channelId }
      );
      return { processed: true, reason: 'unapproved', pairingRequest: false };
    } else if (result.reason === 'denied_cooldown') {
      this.deps.logger.info(`Contact ${this.maskContactId(contactId)} is in cooldown period`, {
        contactId: this.maskContactId(contactId),
        channelId,
      });
      return { processed: true, reason: 'denied' };
    }

    return { processed: true, reason: 'unapproved' };
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
