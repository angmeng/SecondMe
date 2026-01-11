/**
 * WhatsApp Client Wrapper
 * Manages WhatsApp Web connection using whatsapp-web.js with LocalAuth
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, Message } = pkg;
import { io } from '../index';
import { redisClient } from '../redis/client';
import path from 'path';

class WhatsAppClient {
  private client: Client;
  private ready: boolean = false;

  constructor() {
    // Initialize WhatsApp client with LocalAuth strategy
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: path.join(process.cwd(), '.wwebjs_auth'),
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // QR code event - stream to frontend via Socket.io
    this.client.on('qr', (qr) => {
      console.log('[Gateway WhatsApp] QR code received');

      // Emit QR code to all connected dashboard clients
      io.emit('qr_code', {
        qr,
        timestamp: Date.now(),
      });

      // Also publish to Redis pub/sub for distributed systems
      redisClient.publish('events:qr', JSON.stringify({
        qr,
        timestamp: Date.now(),
      })).catch(err => console.error('[Gateway WhatsApp] Failed to publish QR:', err));
    });

    // Ready event - WhatsApp connected
    this.client.on('ready', () => {
      console.log('[Gateway WhatsApp] WhatsApp client ready and connected');
      this.ready = true;

      // Emit ready status to dashboard
      io.emit('whatsapp_status', {
        status: 'connected',
        timestamp: Date.now(),
      });

      // Publish to Redis
      redisClient.publish('events:status', JSON.stringify({
        service: 'gateway',
        status: 'connected',
        timestamp: Date.now(),
      })).catch(err => console.error('[Gateway WhatsApp] Failed to publish status:', err));
    });

    // Authenticated event
    this.client.on('authenticated', () => {
      console.log('[Gateway WhatsApp] Authentication successful');
    });

    // Authentication failure event
    this.client.on('auth_failure', (msg) => {
      console.error('[Gateway WhatsApp] Authentication failed:', msg);

      io.emit('whatsapp_status', {
        status: 'auth_failed',
        error: msg,
        timestamp: Date.now(),
      });
    });

    // Disconnected event
    this.client.on('disconnected', (reason) => {
      console.log('[Gateway WhatsApp] Client disconnected:', reason);
      this.ready = false;

      io.emit('whatsapp_status', {
        status: 'disconnected',
        reason,
        timestamp: Date.now(),
      });

      // Publish to Redis
      redisClient.publish('events:status', JSON.stringify({
        service: 'gateway',
        status: 'disconnected',
        reason,
        timestamp: Date.now(),
      })).catch(err => console.error('[Gateway WhatsApp] Failed to publish status:', err));
    });

    // Message received event
    this.client.on('message', async (message: Message) => {
      try {
        await this.handleIncomingMessage(message);
      } catch (error) {
        console.error('[Gateway WhatsApp] Error handling message:', error);
      }
    });

    // Loading screen event
    this.client.on('loading_screen', (percent, message) => {
      console.log(`[Gateway WhatsApp] Loading: ${percent}% - ${message}`);
    });
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    const contactId = message.from;
    const content = message.body;
    const fromMe = message.fromMe;
    const timestamp = message.timestamp * 1000; // Convert to ms

    console.log(`[Gateway WhatsApp] Message received from ${contactId}: ${fromMe ? '(from me)' : content.substring(0, 50)}`);

    // If message is from the user (fromMe: true), trigger auto-pause
    if (fromMe) {
      console.log(`[Gateway WhatsApp] User message detected, triggering auto-pause for ${contactId}`);
      await redisClient.setPause(contactId, 3600); // 60 minute pause
      return;
    }

    // Check if bot is paused for this contact
    const isPaused = await redisClient.isPaused(contactId);
    if (isPaused) {
      console.log(`[Gateway WhatsApp] Bot is paused for ${contactId}, skipping message`);
      return;
    }

    // Publish message to Redis queue for orchestrator to process
    const messagePayload = JSON.stringify({
      messageId: message.id._serialized,
      contactId,
      content,
      timestamp,
      direction: 'incoming',
      fromMe: false,
    });

    await redisClient.client.xadd('QUEUE:messages', '*', 'payload', messagePayload);
    console.log(`[Gateway WhatsApp] Message queued for processing: ${message.id._serialized}`);

    // Also publish to real-time events for dashboard
    await redisClient.publish('events:messages', JSON.stringify({
      messageId: message.id._serialized,
      contactId,
      content,
      timestamp,
      direction: 'incoming',
      botSent: false,
    }));
  }

  async initialize(): Promise<void> {
    console.log('[Gateway WhatsApp] Initializing WhatsApp client...');
    await this.client.initialize();
  }

  async destroy(): Promise<void> {
    console.log('[Gateway WhatsApp] Destroying WhatsApp client...');
    this.ready = false;
    await this.client.destroy();
  }

  isReady(): boolean {
    return this.ready;
  }

  getClient(): Client {
    return this.client;
  }
}

// Export singleton instance
export const whatsappClient = new WhatsAppClient();
