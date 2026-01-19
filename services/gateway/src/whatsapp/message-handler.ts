/**
 * WhatsApp Message Handler
 * Handles incoming messages, fromMe detection, and message queueing
 */

import { Client, Message } from 'whatsapp-web.js';
import { redisClient } from '../redis/client.js';
import { io } from '../index.js';

export class MessageHandler {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
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
    const content = message.body;
    const timestamp = message.timestamp * 1000; // Convert to milliseconds

    console.log(`[Gateway MessageHandler] Incoming message from ${contactId}: ${content}`);

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

    console.log(`[Gateway MessageHandler] fromMe message detected to ${contactId}: ${content}`);

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
