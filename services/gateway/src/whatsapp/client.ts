/**
 * WhatsApp Client Wrapper
 * Manages WhatsApp Web connection using whatsapp-web.js with LocalAuth
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { redisClient } from '../redis/client.js';
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
    // QR code event - publish to Redis for distributed systems
    // Socket.io events are now handled by WhatsAppChannel
    this.client.on('qr', (qr: string) => {
      console.log('[Gateway WhatsApp] QR code received');

      // Publish to Redis pub/sub for distributed systems
      redisClient.publish('events:qr', JSON.stringify({
        qr,
        timestamp: Date.now(),
      })).catch((err: unknown) => console.error('[Gateway WhatsApp] Failed to publish QR:', err));
    });

    // Ready event - WhatsApp connected
    this.client.on('ready', () => {
      console.log('[Gateway WhatsApp] WhatsApp client ready and connected');
      this.ready = true;

      // Publish to Redis for distributed systems
      redisClient.publish('events:status', JSON.stringify({
        service: 'gateway',
        status: 'connected',
        timestamp: Date.now(),
      })).catch((err: unknown) => console.error('[Gateway WhatsApp] Failed to publish status:', err));
    });

    // Authenticated event
    this.client.on('authenticated', () => {
      console.log('[Gateway WhatsApp] Authentication successful');
    });

    // Authentication failure event
    this.client.on('auth_failure', (msg: string) => {
      console.error('[Gateway WhatsApp] Authentication failed:', msg);
      // Socket.io events are now handled by WhatsAppChannel
    });

    // Disconnected event
    this.client.on('disconnected', (reason: string) => {
      console.log('[Gateway WhatsApp] Client disconnected:', reason);
      this.ready = false;

      // Publish to Redis for distributed systems
      redisClient.publish('events:status', JSON.stringify({
        service: 'gateway',
        status: 'disconnected',
        reason,
        timestamp: Date.now(),
      })).catch((err: unknown) => console.error('[Gateway WhatsApp] Failed to publish status:', err));
    });

    // Loading screen event
    this.client.on('loading_screen', (percent: number, message: string) => {
      console.log(`[Gateway WhatsApp] Loading: ${percent}% - ${message}`);
    });
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

  /**
   * Check if the puppeteer browser is still connected
   * This helps detect detached frame conditions before they cause errors
   */
  isBrowserConnected(): boolean {
    try {
      // Access the underlying puppeteer browser
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const browser = (this.client as any).pupBrowser;
      return browser?.isConnected() ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Check if the client is ready for operations
   * Verifies both the ready flag AND the browser connection state
   */
  isReady(): boolean {
    return this.ready && this.isBrowserConnected();
  }

  getClient(): Client {
    return this.client;
  }
}

// Export singleton instance
export const whatsappClient = new WhatsAppClient();
