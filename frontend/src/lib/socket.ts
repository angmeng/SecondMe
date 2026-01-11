/**
 * Socket.io Client Singleton
 * Manages WebSocket connection to Gateway service for real-time updates
 */

import { io, Socket } from 'socket.io-client';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';

class SocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Get or create Socket.io connection
   */
  getSocket(): Socket {
    if (!this.socket) {
      this.socket = io(GATEWAY_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
      });

      this.setupEventHandlers();
    }

    return this.socket;
  }

  /**
   * Setup Socket.io event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[Socket Client] Connected to Gateway');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[Socket Client] Disconnected: ${reason}`);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket Client] Connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[Socket Client] Max reconnection attempts reached');
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`[Socket Client] Reconnected after ${attemptNumber} attempts`);
      this.reconnectAttempts = 0;
    });

    this.socket.on('reconnect_failed', () => {
      console.error('[Socket Client] Reconnection failed');
    });
  }

  /**
   * Subscribe to QR code updates
   */
  onQRCode(callback: (data: { qr: string; timestamp: number }) => void): void {
    const socket = this.getSocket();
    socket.on('qr_code', callback);
  }

  /**
   * Subscribe to pause state updates
   */
  onPauseUpdate(
    callback: (data: {
      contactId: string;
      action: 'pause' | 'resume';
      reason?: string;
      expiresAt?: number;
    }) => void
  ): void {
    const socket = this.getSocket();
    socket.on('pause_update', callback);
  }

  /**
   * Subscribe to WhatsApp connection status
   */
  onConnectionStatus(
    callback: (data: { status: 'connected' | 'disconnected' | 'qr' | 'ready' }) => void
  ): void {
    const socket = this.getSocket();
    socket.on('connection_status', callback);
  }

  /**
   * Subscribe to message status updates
   */
  onMessageStatus(
    callback: (data: {
      messageId: string;
      status: 'sent' | 'delivered' | 'read' | 'failed';
      timestamp: number;
    }) => void
  ): void {
    const socket = this.getSocket();
    socket.on('message_status', callback);
  }

  /**
   * Unsubscribe from all events
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Export singleton instance
export const socketClient = new SocketClient();
