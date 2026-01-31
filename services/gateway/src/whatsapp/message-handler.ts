/**
 * WhatsApp Message Handler
 * Handles incoming messages, fromMe detection, contact approval gate, and message queueing
 *
 * Contact Approval Mode:
 * - Unknown contacts are blocked by default (no auto-reply)
 * - First message stores them as "pending" in dashboard
 * - Admin enables/disables contacts with one click
 * - No verification codes or pairing prompts sent to users
 */

import { Client, Message } from 'whatsapp-web.js';
import { redisClient } from '../redis/client.js';
import { historyStore } from '../redis/history-store.js';
import { pairingStore } from '../redis/pairing-store.js';
import { io } from '../index.js';
import type { MessageSender } from './sender.js';

export class MessageHandler {
  private client: Client;
  private sender: MessageSender;

  constructor(client: Client, sender: MessageSender) {
    this.client = client;
    this.sender = sender;
    this.setupMessageHandlers();
  }

  /**
   * Setup WhatsApp message event handlers
   */
  private setupMessageHandlers(): void {
    this.client.on('message', async (message: Message) => {
      try {
        await this.handleIncomingMessage(message);
      } catch (error) {
        console.error('[Gateway MessageHandler] Error handling message:', error);
      }
    });

    this.client.on('message_create', async (message: Message) => {
      try {
        // Handle both incoming and outgoing messages for comprehensive logging
        if (message.fromMe) {
          await this.handleFromMeMessage(message);
        }
      } catch (error) {
        console.error('[Gateway MessageHandler] Error handling message_create:', error);
      }
    });
  }

  /**
   * Handle incoming message (not from user)
   */
  private async handleIncomingMessage(message: Message): Promise<void> {
    // Ignore messages from self
    if (message.fromMe) {
      return;
    }

    const contactId = message.from;

    // Ignore group chat messages - bot only operates in individual chats
    if (contactId.endsWith('@g.us')) {
      console.log(`[Gateway MessageHandler] Ignoring group message from ${contactId}`);
      return;
    }

    const content = message.body;
    const timestamp = message.timestamp * 1000; // Convert to milliseconds

    console.log(`[Gateway MessageHandler] Incoming message from ${contactId}: ${content}`);

    // PAIRING GATE: Check if contact is approved before processing
    const isApproved = await pairingStore.isApproved(contactId);
    if (!isApproved) {
      await this.handleUnapprovedContact(message, contactId, content);
      return;
    }

    // Store message in conversation history (only for approved contacts)
    // This ensures context is preserved even for messages that don't get processed
    await historyStore.addMessage(contactId, {
      id: message.id._serialized,
      role: 'user',
      content,
      timestamp,
      type: 'incoming',
    });

    // Check if contact is paused (global or contact-specific)
    const isPaused = await redisClient.isPaused(contactId);
    if (isPaused) {
      console.log(`[Gateway MessageHandler] Contact ${contactId} is paused, skipping message`);
      return;
    }

    // Check rate limit (10 messages per minute)
    const isRateLimited = await this.checkRateLimit(contactId);
    if (isRateLimited) {
      console.log(`[Gateway MessageHandler] Rate limit exceeded for ${contactId}, auto-paused`);
      return;
    }

    // Get contact info for context
    const contact = await message.getContact();
    const contactName = contact.pushname || contact.name || 'Unknown';

    // Queue message to Redis for Orchestrator to process
    const messagePayload = {
      messageId: message.id._serialized,
      contactId,
      contactName,
      content,
      timestamp,
      hasMedia: message.hasMedia,
      type: message.type,
    };

    await redisClient.queueMessage(messagePayload);

    console.log(`[Gateway MessageHandler] Message queued for processing: ${message.id._serialized}`);

    // Emit event for real-time monitoring
    io.emit('message_received', {
      contactId,
      contactName,
      timestamp,
      preview: content.substring(0, 50),
    });
  }

  /**
   * Handle fromMe message (user sent message manually)
   * CRITICAL: Auto-pause bot indefinitely when user intervenes
   */
  private async handleFromMeMessage(message: Message): Promise<void> {
    const contactId = message.to;
    const content = message.body;
    const timestamp = message.timestamp * 1000; // Convert to milliseconds

    console.log(`[Gateway MessageHandler] fromMe message detected to ${contactId}: ${content}`);

    // Store user's manual message in conversation history
    // Marked as 'assistant' role since it's from the bot's side of the conversation
    await historyStore.addMessage(contactId, {
      id: message.id._serialized,
      role: 'assistant',
      content,
      timestamp,
      type: 'fromMe',
    });

    // Auto-pause bot for this contact (indefinite - no TTL)
    const pausedAt = Date.now();

    await redisClient.client.set(
      `PAUSE:${contactId}`,
      JSON.stringify({ pausedAt, reason: 'fromMe' })
    );

    // Publish pause event
    await redisClient.publish(
      'events:pause',
      JSON.stringify({
        contactId,
        action: 'pause',
        reason: 'fromMe',
        pausedAt,
        timestamp: Date.now(),
      })
    );

    console.log(
      `[Gateway MessageHandler] Auto-pause triggered for ${contactId} (indefinite) due to fromMe message`
    );

    // Emit to frontend for real-time UI update
    io.emit('pause_update', {
      contactId,
      action: 'pause',
      reason: 'fromMe',
      pausedAt,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle unapproved contact - auto-approve if existing or store as pending
   * CRITICAL: This method gates all unapproved contacts from the AI
   *
   * Flow:
   * 1. Check if contact is denied (cooling off period) → ignore
   * 2. Check if auto-approve enabled AND contact has existing history → auto-approve
   * 3. Otherwise, store as "pending" in Redis for admin review (no reply)
   */
  private async handleUnapprovedContact(
    message: Message,
    contactId: string,
    content: string
  ): Promise<void> {
    // Check if contact is denied (cooling off period)
    const isDenied = await pairingStore.isDenied(contactId);
    if (isDenied) {
      console.log(`[Gateway MessageHandler] Contact ${contactId} is denied, ignoring message`);
      return;
    }

    // Get contact info (needed for both auto-approve and pending request)
    const contact = await message.getContact();
    const displayName = contact.pushname || contact.name;

    // Check if auto-approve existing contacts is enabled
    if (pairingStore.isAutoApproveExistingEnabled()) {
      const hasHistory = await pairingStore.hasConversationHistory(contactId);

      if (hasHistory) {
        console.log(
          `[Gateway MessageHandler] Auto-approving existing contact ${contactId} (has conversation history)`
        );

        // Auto-approve with 'standard' tier
        await pairingStore.approveContact(contactId, 'system:auto-approve', 'standard');

        // Now process the message normally by re-invoking handleIncomingMessage
        // Since the contact is now approved, it will proceed through the normal flow
        await this.processApprovedMessage(message, contactId, displayName || 'Unknown', content);
        return;
      }
    }

    // No existing history or auto-approve disabled → store as pending
    const phoneNumber = contactId.replace('@c.us', '');

    // Create pairing request (stores contact as pending)
    // Include first message for admin context
    const result = await pairingStore.createPairingRequest(
      contactId,
      displayName,
      undefined, // profilePicUrl
      undefined, // channelId
      content // firstMessage - for admin context
    );

    if (result.success) {
      console.log(`[Gateway MessageHandler] Created pending request for ${contactId}`);

      // Emit pairing request event for real-time dashboard update
      io.emit('pairing_request', {
        contactId,
        displayName,
        phoneNumber,
        firstMessage: content,
        timestamp: Date.now(),
      });

      // Send auto-reply if enabled (non-blocking - don't fail if send fails)
      if (pairingStore.isAutoReplyUnknownEnabled()) {
        try {
          const autoReplyMessage = pairingStore.getAutoReplyMessage();
          await this.sender.sendMessage(contactId, autoReplyMessage, {
            simulateTyping: true,
          });
          console.log(`[Gateway MessageHandler] Auto-reply sent to ${contactId}`);
        } catch (error) {
          // Log but don't fail - the pending request was already created successfully
          console.error(`[Gateway MessageHandler] Failed to send auto-reply to ${contactId}:`, error);
        }
      }
    } else if (result.reason === 'already_approved') {
      // Race condition - contact was approved between checks
      console.log(`[Gateway MessageHandler] Contact ${contactId} already approved (race condition)`);
    } else if (result.reason === 'already_pending') {
      // Already has pending request - just log, no action needed
      console.log(`[Gateway MessageHandler] Contact ${contactId} already pending (message ignored)`);
    } else if (result.reason === 'denied_cooldown') {
      console.log(`[Gateway MessageHandler] Contact ${contactId} is in cooldown period`);
    }
  }

  /**
   * Process a message from an approved contact
   * Extracted from handleIncomingMessage to support auto-approve flow
   */
  private async processApprovedMessage(
    message: Message,
    contactId: string,
    contactName: string,
    content: string
  ): Promise<void> {
    const timestamp = message.timestamp * 1000; // Convert to milliseconds

    // Store message in conversation history
    await historyStore.addMessage(contactId, {
      id: message.id._serialized,
      role: 'user',
      content,
      timestamp,
      type: 'incoming',
    });

    // Check if contact is paused (global or contact-specific)
    const isPaused = await redisClient.isPaused(contactId);
    if (isPaused) {
      console.log(`[Gateway MessageHandler] Contact ${contactId} is paused, skipping message`);
      return;
    }

    // Check rate limit (10 messages per minute)
    const isRateLimited = await this.checkRateLimit(contactId);
    if (isRateLimited) {
      console.log(`[Gateway MessageHandler] Rate limit exceeded for ${contactId}, auto-paused`);
      return;
    }

    // Queue message to Redis for Orchestrator to process
    const messagePayload = {
      messageId: message.id._serialized,
      contactId,
      contactName,
      content,
      timestamp,
      hasMedia: message.hasMedia,
      type: message.type,
    };

    await redisClient.queueMessage(messagePayload);

    console.log(`[Gateway MessageHandler] Message queued for processing: ${message.id._serialized}`);

    // Emit event for real-time monitoring
    io.emit('message_received', {
      contactId,
      contactName,
      timestamp,
      preview: content.substring(0, 50),
    });
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    try {
      const message = await this.client.getMessageById(messageId);
      if (message) {
        // Note: whatsapp-web.js doesn't have direct markAsRead
        // Messages are auto-marked as read when we send a response
        console.log(`[Gateway MessageHandler] Message marked as read: ${messageId}`);
      }
    } catch (error) {
      console.error(`[Gateway MessageHandler] Error marking message as read:`, error);
    }
  }

  /**
   * Check rate limit for contact
   * Rate limit: 10 messages per minute
   * Returns true if rate limited (exceeded threshold)
   */
  private async checkRateLimit(contactId: string): Promise<boolean> {
    const key = `COUNTER:${contactId}:msgs`;
    const threshold = 10;

    try {
      // Increment message counter
      const count = await redisClient.client.incr(key);

      // Set TTL on first message (60 seconds)
      if (count === 1) {
        await redisClient.client.expire(key, 60);
      }

      // Check if threshold exceeded
      if (count > threshold) {
        // Auto-pause indefinitely (no TTL)
        const pausedAt = Date.now();

        await redisClient.client.set(
          `PAUSE:${contactId}`,
          JSON.stringify({ pausedAt, reason: 'rate_limit' })
        );

        // Publish rate limit event
        await redisClient.publish(
          'events:pause',
          JSON.stringify({
            contactId,
            action: 'pause',
            reason: 'rate_limit',
            count,
            threshold,
            pausedAt,
            timestamp: Date.now(),
          })
        );

        // Emit to frontend
        io.emit('rate_limit', {
          contactId,
          count,
          threshold,
          pausedAt,
          timestamp: Date.now(),
        });

        console.log(
          `[Gateway MessageHandler] Rate limit exceeded for ${contactId}: ${count}/${threshold} messages`
        );

        return true; // Rate limited
      }

      return false; // Not rate limited
    } catch (error) {
      console.error(`[Gateway MessageHandler] Error checking rate limit:`, error);
      return false; // Don't block on error
    }
  }

  /**
   * Get contact information
   */
  async getContactInfo(contactId: string): Promise<any> {
    try {
      const contact = await this.client.getContactById(contactId);
      return {
        id: contactId,
        name: contact.pushname || contact.name || 'Unknown',
        isBlocked: contact.isBlocked,
        isGroup: contact.isGroup,
        isMyContact: contact.isMyContact,
      };
    } catch (error) {
      console.error(`[Gateway MessageHandler] Error getting contact info:`, error);
      return null;
    }
  }
}
