/**
 * WhatsApp Session Manager
 * T095-T097: Manages WhatsApp session expiry, refresh, and notifications
 *
 * WhatsApp Web sessions typically last 14 days but can expire earlier
 * if the phone goes offline or the session is manually invalidated.
 */

import { Client, WAState } from 'whatsapp-web.js';
import { io } from '../index.js';
import { redisClient } from '../redis/client.js';

export interface SessionInfo {
  /** When the session was created */
  createdAt: number;
  /** When the session was last verified active */
  lastVerifiedAt: number;
  /** When the session is expected to expire (estimated) */
  estimatedExpiryAt: number;
  /** Current session state */
  state: WAState | 'unknown';
  /** Whether the session needs refresh */
  needsRefresh: boolean;
}

const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours before expiry
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
const REDIS_KEY = 'SESSION:whatsapp:info';

export class SessionManager {
  private client: Client;
  private checkInterval: NodeJS.Timeout | null = null;
  private sessionInfo: SessionInfo | null = null;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Initialize session tracking
   * Called when WhatsApp client becomes ready
   */
  async initialize(): Promise<void> {
    console.log('[SessionManager] Initializing session tracking...');

    // Load existing session info or create new
    const existingSession = await this.loadSessionInfo();

    if (existingSession) {
      this.sessionInfo = existingSession;
      console.log('[SessionManager] Loaded existing session info');
    } else {
      // Create new session info
      this.sessionInfo = {
        createdAt: Date.now(),
        lastVerifiedAt: Date.now(),
        estimatedExpiryAt: Date.now() + SESSION_DURATION_MS,
        state: await this.getClientState(),
        needsRefresh: false,
      };
      await this.saveSessionInfo();
      console.log('[SessionManager] Created new session info');
    }

    // Start periodic checks
    this.startPeriodicCheck();

    // Emit initial session info
    this.emitSessionUpdate();
  }

  /**
   * Start periodic session checks
   */
  private startPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      await this.checkSession();
    }, CHECK_INTERVAL_MS);

    console.log('[SessionManager] Started periodic session check');
  }

  /**
   * Stop periodic checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[SessionManager] Stopped periodic session check');
  }

  /**
   * Check current session status
   */
  async checkSession(): Promise<SessionInfo> {
    if (!this.sessionInfo) {
      await this.initialize();
    }

    const now = Date.now();
    const state = await this.getClientState();

    // Update session info
    this.sessionInfo = {
      ...this.sessionInfo!,
      lastVerifiedAt: now,
      state,
      needsRefresh: this.shouldRefresh(),
    };

    // Check if session is near expiry
    if (this.sessionInfo.needsRefresh) {
      console.log('[SessionManager] Session approaching expiry, notifying user');
      this.emitExpiryWarning();
    }

    // Check if session appears expired
    if (state === 'CONFLICT' || state === 'UNPAIRED') {
      console.log('[SessionManager] Session appears expired or disconnected');
      this.emitSessionExpired();
    }

    await this.saveSessionInfo();
    this.emitSessionUpdate();

    return this.sessionInfo;
  }

  /**
   * Get current client state safely with timeout
   */
  private async getClientState(): Promise<WAState | 'unknown'> {
    // If client isn't connected, return unknown immediately
    if (!this.client.info) {
      return 'unknown';
    }

    try {
      // Add timeout to prevent hanging on puppeteer issues
      const timeoutPromise = new Promise<'unknown'>((resolve) => {
        setTimeout(() => resolve('unknown'), 3000);
      });

      const statePromise = this.client.getState();
      const state = await Promise.race([statePromise, timeoutPromise]);
      return state || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if session should be refreshed
   */
  private shouldRefresh(): boolean {
    if (!this.sessionInfo) return true;

    const timeUntilExpiry = this.sessionInfo.estimatedExpiryAt - Date.now();
    return timeUntilExpiry < REFRESH_THRESHOLD_MS;
  }

  /**
   * Get time remaining until session expires
   */
  getTimeRemaining(): {
    hours: number;
    minutes: number;
    isExpiring: boolean;
  } {
    if (!this.sessionInfo) {
      return { hours: 0, minutes: 0, isExpiring: true };
    }

    const remaining = Math.max(0, this.sessionInfo.estimatedExpiryAt - Date.now());
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

    return {
      hours,
      minutes,
      isExpiring: remaining < REFRESH_THRESHOLD_MS,
    };
  }

  /**
   * Refresh session (requires new QR code scan)
   */
  async refreshSession(): Promise<void> {
    console.log('[SessionManager] Initiating session refresh...');

    // Emit event to notify frontend
    io.emit('session_refresh_required', {
      reason: 'manual_refresh',
      timestamp: Date.now(),
    });

    // Only attempt logout if client is connected
    // Check if client.info exists (indicates successful connection)
    if (!this.client.info) {
      console.log('[SessionManager] Client not connected, skipping logout');
      return;
    }

    // Logout to trigger new QR code
    try {
      await this.client.logout();
      console.log('[SessionManager] Logged out for session refresh');
    } catch (error: any) {
      // Handle detached frame error gracefully - this happens when browser is already closed
      if (error.message?.includes('detached Frame')) {
        console.log('[SessionManager] Browser frame already detached, session will restart');
      } else {
        console.error('[SessionManager] Error during logout:', error);
      }
    }
  }

  /**
   * Handle successful re-authentication
   * Called when a new QR code is scanned
   */
  async handleReauthentication(): Promise<void> {
    console.log('[SessionManager] Session re-authenticated');

    this.sessionInfo = {
      createdAt: Date.now(),
      lastVerifiedAt: Date.now(),
      estimatedExpiryAt: Date.now() + SESSION_DURATION_MS,
      state: 'CONNECTED',
      needsRefresh: false,
    };

    await this.saveSessionInfo();
    this.emitSessionUpdate();

    io.emit('session_refreshed', {
      timestamp: Date.now(),
      expiresAt: this.sessionInfo.estimatedExpiryAt,
    });
  }

  /**
   * Emit session update event
   */
  private emitSessionUpdate(): void {
    if (!this.sessionInfo) return;

    const timeRemaining = this.getTimeRemaining();

    io.emit('session_update', {
      ...this.sessionInfo,
      timeRemaining,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit session expiry warning
   */
  private emitExpiryWarning(): void {
    const timeRemaining = this.getTimeRemaining();

    io.emit('session_expiry_warning', {
      hoursRemaining: timeRemaining.hours,
      minutesRemaining: timeRemaining.minutes,
      estimatedExpiryAt: this.sessionInfo?.estimatedExpiryAt,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit session expired event
   */
  private emitSessionExpired(): void {
    io.emit('session_expired', {
      reason: 'Session disconnected or expired',
      timestamp: Date.now(),
    });
  }

  /**
   * Load session info from Redis
   */
  private async loadSessionInfo(): Promise<SessionInfo | null> {
    try {
      const data = await redisClient.client.get(REDIS_KEY);
      if (data) {
        return JSON.parse(data) as SessionInfo;
      }
    } catch (error) {
      console.error('[SessionManager] Error loading session info:', error);
    }
    return null;
  }

  /**
   * Save session info to Redis
   */
  private async saveSessionInfo(): Promise<void> {
    if (!this.sessionInfo) return;

    try {
      await redisClient.client.set(REDIS_KEY, JSON.stringify(this.sessionInfo));
    } catch (error) {
      console.error('[SessionManager] Error saving session info:', error);
    }
  }

  /**
   * Get current session info
   */
  getSessionInfo(): SessionInfo | null {
    return this.sessionInfo;
  }

  /**
   * Get session status for API response
   * Returns cached data - session is checked periodically by the interval
   */
  getStatus(): {
    isActive: boolean;
    needsRefresh: boolean;
    timeRemaining: { hours: number; minutes: number; isExpiring: boolean };
    state: string;
    createdAt: number | null;
    expiresAt: number | null;
  } {
    // Return cached data immediately - don't block on checkSession
    // Session state is updated periodically by the interval and on events

    // If sessionInfo is not set yet or has unknown state, check client.info as fallback
    // This handles the race condition where getStatus is called before initialize() completes
    let state = this.sessionInfo?.state || 'unknown';
    if (state === 'unknown' && this.client.info) {
      // Client is connected but sessionInfo hasn't been updated yet
      state = 'CONNECTED';
    }

    return {
      isActive: state === 'CONNECTED',
      needsRefresh: this.sessionInfo?.needsRefresh || false,
      timeRemaining: this.getTimeRemaining(),
      state,
      createdAt: this.sessionInfo?.createdAt || null,
      expiresAt: this.sessionInfo?.estimatedExpiryAt || null,
    };
  }
}
