/**
 * WhatsApp Client Wrapper
 * Manages WhatsApp Web connection using whatsapp-web.js with LocalAuth
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
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
      io.emit('connection_status', {
        status: 'ready',
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

      io.emit('connection_status', {
        status: 'disconnected',
        error: msg,
        timestamp: Date.now(),
      });
    });

    // Disconnected event
    this.client.on('disconnected', (reason) => {
      console.log('[Gateway WhatsApp] Client disconnected:', reason);
      this.ready = false;

      io.emit('connection_status', {
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

    // Loading screen event
    this.client.on('loading_screen', (percent, message) => {
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
