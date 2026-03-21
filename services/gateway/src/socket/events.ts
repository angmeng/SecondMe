/**
 * Socket.io Event Emitter
 * Broadcasts real-time events to connected clients
 */

import { Server } from 'socket.io';
import { SOCKET_EVENTS } from '@secondme/shared-types';

export class SocketEventEmitter {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * Broadcast QR code to all connected clients
   */
  emitQRCode(qr: string): void {
    this.io.emit(SOCKET_EVENTS.QR_CODE, {
      qr,
      timestamp: Date.now(),
    });
    console.log('[Gateway Socket] QR code broadcasted');
  }

  /**
   * Broadcast connection status
   */
  emitConnectionStatus(status: 'connected' | 'disconnected' | 'qr' | 'ready' | 'authenticated'): void {
    this.io.emit(SOCKET_EVENTS.CONNECTION_STATUS, {
      status,
      timestamp: Date.now(),
    });
    console.log(`[Gateway Socket] Connection status: ${status}`);
  }

  /**
   * Broadcast pause update
   */
  emitPauseUpdate(data: {
    contactId: string;
    action: 'pause' | 'resume';
    reason?: string;
    pausedAt?: number;
  }): void {
    this.io.emit(SOCKET_EVENTS.PAUSE_UPDATE, {
      ...data,
      timestamp: Date.now(),
    });
    console.log(`[Gateway Socket] Pause update: ${data.action} for ${data.contactId}`);
  }

  /**
   * Broadcast message received event
   */
  emitMessageReceived(data: {
    contactId: string;
    contactName: string;
    preview: string;
  }): void {
    this.io.emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
      ...data,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast message sent event
   */
  emitMessageSent(data: {
    contactId: string;
    messageId: string;
  }): void {
    this.io.emit(SOCKET_EVENTS.MESSAGE_SENT, {
      ...data,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast message failed event
   */
  emitMessageFailed(data: {
    contactId: string;
    error: string;
  }): void {
    this.io.emit(SOCKET_EVENTS.MESSAGE_FAILED, {
      ...data,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast typing status
   */
  emitTypingStatus(data: {
    contactId: string;
    isTyping: boolean;
  }): void {
    this.io.emit(SOCKET_EVENTS.TYPING_STATUS, {
      ...data,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast loading status
   */
  emitLoadingStatus(data: {
    percent: number;
    message: string;
  }): void {
    this.io.emit(SOCKET_EVENTS.LOADING_STATUS, {
      ...data,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast rate limit event
   */
  emitRateLimit(data: {
    contactId: string;
    count: number;
    threshold: number;
    pausedAt: number;
  }): void {
    this.io.emit(SOCKET_EVENTS.RATE_LIMIT, {
      ...data,
      timestamp: Date.now(),
    });
    console.log(`[Gateway Socket] Rate limit triggered for ${data.contactId}`);
  }

  /**
   * Broadcast error event
   */
  emitError(data: {
    type: string;
    message: string;
    details?: any;
  }): void {
    this.io.emit(SOCKET_EVENTS.ERROR, {
      ...data,
      timestamp: Date.now(),
    });
    console.error(`[Gateway Socket] Error: ${data.type} - ${data.message}`);
  }

  /**
   * Get connected client count
   */
  getConnectedClients(): number {
    return this.io.sockets.sockets.size;
  }

  /**
   * Broadcast to specific room
   */
  emitToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, {
      ...data,
      timestamp: Date.now(),
    });
  }
}
