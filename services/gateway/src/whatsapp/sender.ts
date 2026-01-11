/**
 * WhatsApp Message Sender
 * Sends messages with typing indicator simulation for human-like behavior
 */

import { Client } from 'whatsapp-web.js';
import { io } from '../index.js';

export class MessageSender {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Send message with typing indicator simulation
   * Implements HTS (Human Typing Simulation) timing
   */
  async sendMessage(
    contactId: string,
    content: string,
    options: {
      typingDelay?: number; // Custom typing delay in ms
      simulateTyping?: boolean; // Whether to show typing indicator
    } = {}
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { typingDelay = this.calculateTypingDelay(content), simulateTyping = true } = options;

    try {
      console.log(
        `[Gateway Sender] Sending message to ${contactId} (typing delay: ${typingDelay}ms)`
      );

      // Start typing indicator
      if (simulateTyping) {
        await this.startTyping(contactId);

        // Emit typing status to frontend
        io.emit('typing_status', {
          contactId,
          isTyping: true,
          timestamp: Date.now(),
        });

        // Wait for typing delay to simulate human typing
        await this.sleep(typingDelay);
      }

      // Send the message
      const message = await this.client.sendMessage(contactId, content);

      // Stop typing indicator
      if (simulateTyping) {
        await this.stopTyping(contactId);

        io.emit('typing_status', {
          contactId,
          isTyping: false,
          timestamp: Date.now(),
        });
      }

      console.log(
        `[Gateway Sender] Message sent successfully to ${contactId}: ${message.id._serialized}`
      );

      // Emit message sent event
      io.emit('message_sent', {
        contactId,
        messageId: message.id._serialized,
        timestamp: Date.now(),
      });

      return {
        success: true,
        messageId: message.id._serialized,
      };
    } catch (error: any) {
      console.error(`[Gateway Sender] Error sending message to ${contactId}:`, error);

      // Stop typing on error
      await this.stopTyping(contactId);

      io.emit('typing_status', {
        contactId,
        isTyping: false,
        timestamp: Date.now(),
      });

      io.emit('message_failed', {
        contactId,
        error: error.message,
        timestamp: Date.now(),
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Calculate typing delay based on message length
   * HTS Formula: 30ms base + (2ms per character) + random jitter
   */
  private calculateTypingDelay(content: string): number {
    const baseDelay = 30; // 30ms base delay
    const charDelay = content.length * 2; // 2ms per character
    const jitter = Math.random() * 500; // Random jitter up to 500ms

    const totalDelay = baseDelay + charDelay + jitter;

    // Cap at 5 seconds maximum
    return Math.min(totalDelay, 5000);
  }

  /**
   * Start typing indicator
   */
  private async startTyping(contactId: string): Promise<void> {
    try {
      const chat = await this.client.getChatById(contactId);
      await chat.sendStateTyping();
    } catch (error) {
      console.error(`[Gateway Sender] Error starting typing indicator:`, error);
    }
  }

  /**
   * Stop typing indicator
   */
  private async stopTyping(contactId: string): Promise<void> {
    try {
      const chat = await this.client.getChatById(contactId);
      await chat.clearState();
    } catch (error) {
      console.error(`[Gateway Sender] Error stopping typing indicator:`, error);
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Send media message (for future use)
   */
  async sendMedia(
    contactId: string,
    media: any,
    options: {
      caption?: string;
      typingDelay?: number;
    } = {}
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { caption, typingDelay = 2000 } = options;

      // Show typing indicator
      await this.startTyping(contactId);
      await this.sleep(typingDelay);

      // Send media
      const message = await this.client.sendMessage(contactId, media, {
        caption,
      });

      await this.stopTyping(contactId);

      console.log(
        `[Gateway Sender] Media sent successfully to ${contactId}: ${message.id._serialized}`
      );

      return {
        success: true,
        messageId: message.id._serialized,
      };
    } catch (error: any) {
      console.error(`[Gateway Sender] Error sending media to ${contactId}:`, error);

      await this.stopTyping(contactId);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * React to message (for future use)
   */
  async reactToMessage(messageId: string, emoji: string): Promise<boolean> {
    try {
      const message = await this.client.getMessageById(messageId);
      if (message) {
        await message.react(emoji);
        console.log(`[Gateway Sender] Reacted to message ${messageId} with ${emoji}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[Gateway Sender] Error reacting to message:`, error);
      return false;
    }
  }
}
