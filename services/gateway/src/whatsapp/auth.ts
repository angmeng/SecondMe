/**
 * WhatsApp Authentication Handler
 * Manages QR code authentication flow and session persistence
 */

import { Client } from 'whatsapp-web.js';
import { io } from '../index.js';

export class AuthHandler {
  private client: Client;
  private qrCode: string | null = null;
  private isAuthenticated = false;

  constructor(client: Client) {
    this.client = client;
    this.setupAuthHandlers();
  }

  /**
   * Setup WhatsApp authentication event handlers
   */
  private setupAuthHandlers(): void {
    // QR code received - stream to frontend via Socket.io
    this.client.on('qr', (qr: string) => {
      this.qrCode = qr;
      this.isAuthenticated = false;

      console.log('[Gateway Auth] QR code received, broadcasting to clients...');

      // Broadcast QR code to all connected clients
      io.emit('qr_code', {
        qr,
        timestamp: Date.now(),
      });

      // Also emit connection status
      io.emit('connection_status', {
        status: 'qr',
        timestamp: Date.now(),
      });
    });

    // Authentication successful
    this.client.on('authenticated', () => {
      console.log('[Gateway Auth] WhatsApp authenticated successfully');
      this.isAuthenticated = true;
      this.qrCode = null;

      io.emit('connection_status', {
        status: 'authenticated',
        timestamp: Date.now(),
      });
    });

    // Client ready
    this.client.on('ready', () => {
      console.log('[Gateway Auth] WhatsApp client is ready');
      this.isAuthenticated = true;

      io.emit('connection_status', {
        status: 'ready',
        timestamp: Date.now(),
      });
    });

    // Authentication failure
    this.client.on('auth_failure', (message: string) => {
      console.error('[Gateway Auth] Authentication failed:', message);
      this.isAuthenticated = false;

      io.emit('connection_status', {
        status: 'auth_failure',
        message,
        timestamp: Date.now(),
      });
    });

    // Disconnected
    this.client.on('disconnected', (reason: string) => {
      console.log('[Gateway Auth] WhatsApp disconnected:', reason);
      this.isAuthenticated = false;
      this.qrCode = null;

      io.emit('connection_status', {
        status: 'disconnected',
        reason,
        timestamp: Date.now(),
      });
    });

    // Loading screen (initial connection)
    this.client.on('loading_screen', (percent: number, message: string) => {
      console.log(`[Gateway Auth] Loading: ${percent}% - ${message}`);

      io.emit('loading_status', {
        percent,
        message,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Get current QR code
   */
  getQRCode(): string | null {
    return this.qrCode;
  }

  /**
   * Check if authenticated
   */
  isReady(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Get authentication status
   */
  getStatus(): 'disconnected' | 'qr' | 'authenticated' | 'ready' {
    if (this.isAuthenticated) {
      return 'ready';
    } else if (this.qrCode) {
      return 'qr';
    }
    return 'disconnected';
  }

  /**
   * Logout and clear session
   */
  async logout(): Promise<void> {
    try {
      await this.client.logout();
      this.isAuthenticated = false;
      this.qrCode = null;

      io.emit('connection_status', {
        status: 'disconnected',
        reason: 'logout',
        timestamp: Date.now(),
      });

      console.log('[Gateway Auth] Logged out successfully');
    } catch (error) {
      console.error('[Gateway Auth] Logout error:', error);
      throw error;
    }
  }
}
