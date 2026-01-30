/**
 * Redis Client for Server Actions
 * Used by Next.js Server Actions to interact with Redis for pause controls and pairing
 */

import Redis from 'ioredis';
import type { PairingRequest, ApprovedContact, ContactTier } from '@secondme/shared-types';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

class RedisClient {
  public client: Redis; // Made public for direct access when needed
  private isInitialized = false;

  constructor() {
    this.client = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      lazyConnect: true, // Don't connect until first use
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (err) => {
      console.error('[Frontend Redis] Redis client error:', err);
    });
  }

  /**
   * Ensure connection is established
   */
  private async ensureConnected(): Promise<void> {
    // Check actual client status, not just our flag
    // ioredis status: 'wait' | 'reconnecting' | 'connecting' | 'connect' | 'ready' | 'close' | 'end'
    const status = this.client.status;

    if (status === 'ready' || status === 'connect') {
      // Already connected
      this.isInitialized = true;
      return;
    }

    if (status === 'connecting' || status === 'reconnecting') {
      // Wait for connection to complete
      await new Promise<void>((resolve, reject) => {
        this.client.once('ready', () => {
          this.isInitialized = true;
          resolve();
        });
        this.client.once('error', reject);
      });
      return;
    }

    // status is 'wait', 'close', or 'end' - need to connect
    if (!this.isInitialized) {
      try {
        await this.client.connect();
        this.isInitialized = true;
        console.log('[Frontend Redis] Connected to Redis');
      } catch (error) {
        console.error('[Frontend Redis] Failed to connect:', error);
        throw error;
      }
    }
  }

  /**
   * Set global pause (master kill switch)
   */
  async setGlobalPause(duration: number = 0): Promise<void> {
    await this.ensureConnected();

    if (duration > 0) {
      // Set with TTL (in seconds)
      await this.client.setex('PAUSE:ALL', duration, Date.now().toString());
    } else {
      // Set without TTL (indefinite pause)
      await this.client.set('PAUSE:ALL', Date.now().toString());
    }

    console.log(`[Frontend Redis] Global pause set (duration: ${duration}s)`);
  }

  /**
   * Clear global pause (disable master kill switch)
   */
  async clearGlobalPause(): Promise<void> {
    await this.ensureConnected();
    await this.client.del('PAUSE:ALL');
    console.log('[Frontend Redis] Global pause cleared');
  }

  /**
   * Check if global pause is active
   */
  async isGlobalPauseActive(): Promise<boolean> {
    await this.ensureConnected();
    const exists = await this.client.exists('PAUSE:ALL');
    return exists === 1;
  }

  /**
   * Set contact-specific pause (indefinite - no TTL)
   */
  async setContactPause(contactId: string, _duration?: number): Promise<void> {
    await this.ensureConnected();

    // Set pause without TTL - contact stays paused until manually unpaused
    await this.client.set(
      `PAUSE:${contactId}`,
      JSON.stringify({
        pausedAt: Date.now(),
        reason: 'manual',
      })
    );

    console.log(`[Frontend Redis] Contact pause set: ${contactId} (indefinite)`);
  }

  /**
   * Clear contact-specific pause
   */
  async clearContactPause(contactId: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(`PAUSE:${contactId}`);
    console.log(`[Frontend Redis] Contact pause cleared: ${contactId}`);
  }

  /**
   * Check if contact is paused
   */
  async isContactPaused(contactId: string): Promise<boolean> {
    await this.ensureConnected();

    // Check global pause first
    const globalPause = await this.isGlobalPauseActive();
    if (globalPause) return true;

    // Check contact-specific pause (key exists = paused)
    const contactPause = await this.client.exists(`PAUSE:${contactId}`);
    return contactPause === 1;
  }

  /**
   * Get contact pause info (pausedAt timestamp and reason)
   */
  async getContactPauseInfo(
    contactId: string
  ): Promise<{ pausedAt: number; reason: string } | null> {
    await this.ensureConnected();

    const contactPause = await this.client.get(`PAUSE:${contactId}`);
    if (contactPause) {
      try {
        return JSON.parse(contactPause);
      } catch {
        // Legacy format (timestamp string) - treat as paused
        return { pausedAt: parseInt(contactPause, 10), reason: 'legacy' };
      }
    }

    return null;
  }

  /**
   * Get all paused contacts
   */
  async getAllPausedContacts(): Promise<string[]> {
    await this.ensureConnected();

    const keys = await this.client.keys('PAUSE:*');

    // Filter out PAUSE:ALL and extract contact IDs
    return keys
      .filter((key) => key !== 'PAUSE:ALL')
      .map((key) => key.replace('PAUSE:', ''));
  }

  /**
   * Sleep Hours Configuration
   */

  /**
   * Get sleep hours configuration
   */
  async getSleepHoursConfig(): Promise<{
    enabled: boolean;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    timezoneOffset: number;
  }> {
    await this.ensureConnected();

    const cached = await this.client.get('CONFIG:sleep_hours');
    if (cached) {
      return JSON.parse(cached);
    }

    // Default config
    return {
      enabled: true,
      startHour: 23,
      startMinute: 0,
      endHour: 7,
      endMinute: 0,
      timezoneOffset: 0,
    };
  }

  /**
   * Update sleep hours configuration
   */
  async setSleepHoursConfig(config: {
    enabled?: boolean;
    startHour?: number;
    startMinute?: number;
    endHour?: number;
    endMinute?: number;
    timezoneOffset?: number;
  }): Promise<void> {
    await this.ensureConnected();

    const currentConfig = await this.getSleepHoursConfig();
    const newConfig = { ...currentConfig, ...config };

    await this.client.set('CONFIG:sleep_hours', JSON.stringify(newConfig));
    console.log('[Frontend Redis] Sleep hours config updated:', newConfig);
  }

  /**
   * Check if currently in sleep hours
   */
  async isSleepHoursActive(): Promise<{
    isSleeping: boolean;
    wakesUpAt?: number;
    minutesUntilWakeUp?: number;
  }> {
    await this.ensureConnected();

    const config = await this.getSleepHoursConfig();

    if (!config.enabled) {
      return { isSleeping: false };
    }

    // Apply timezone offset to get local time
    const now = new Date();
    const localTime = new Date(now.getTime() + config.timezoneOffset * 60 * 60 * 1000);
    const currentHour = localTime.getUTCHours();
    const currentMinute = localTime.getUTCMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    const sleepStartMinutes = config.startHour * 60 + config.startMinute;
    const sleepEndMinutes = config.endHour * 60 + config.endMinute;

    let isSleeping: boolean;

    // Handle sleep period crossing midnight
    if (sleepStartMinutes > sleepEndMinutes) {
      isSleeping = currentTotalMinutes >= sleepStartMinutes || currentTotalMinutes < sleepEndMinutes;
    } else {
      isSleeping = currentTotalMinutes >= sleepStartMinutes && currentTotalMinutes < sleepEndMinutes;
    }

    if (isSleeping) {
      // Calculate wake up time
      const wakeUp = new Date(now);
      wakeUp.setUTCHours(config.endHour - config.timezoneOffset);
      wakeUp.setUTCMinutes(config.endMinute);
      wakeUp.setUTCSeconds(0);
      wakeUp.setUTCMilliseconds(0);

      if (wakeUp.getTime() <= now.getTime()) {
        wakeUp.setUTCDate(wakeUp.getUTCDate() + 1);
      }

      const minutesUntilWakeUp = Math.ceil((wakeUp.getTime() - now.getTime()) / 60000);

      return {
        isSleeping: true,
        wakesUpAt: wakeUp.getTime(),
        minutesUntilWakeUp,
      };
    }

    return { isSleeping: false };
  }

  /**
   * Get count of deferred messages (messages queued during sleep hours)
   */
  async getDeferredMessageCount(): Promise<number> {
    await this.ensureConnected();
    return this.client.zcard('DEFERRED:messages');
  }

  /**
   * Close Redis connection
   */
  async quit(): Promise<void> {
    if (this.isInitialized) {
      await this.client.quit();
      this.isInitialized = false;
      console.log('[Frontend Redis] Redis connection closed');
    }
  }

  // ============================================================
  // Pairing Methods
  // ============================================================

  /**
   * List pending pairing requests
   */
  async listPendingPairingRequests(limit: number = 100): Promise<PairingRequest[]> {
    await this.ensureConnected();

    const requests: PairingRequest[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        'PAIRING:pending:*',
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await this.client.mget(keys);
        for (const json of values) {
          if (json) {
            try {
              const parsed = JSON.parse(json);
              // Basic validation - check for contactId and status (code field was removed in simplified implementation)
              if (parsed && parsed.contactId && parsed.status === 'pending') {
                requests.push(parsed as PairingRequest);
              }
            } catch {
              // Skip invalid entries
            }
          }
        }
      }

      if (requests.length >= limit) break;
    } while (cursor !== '0');

    // Sort by requestedAt descending (newest first)
    return requests.slice(0, limit).sort((a, b) => b.requestedAt - a.requestedAt);
  }

  /**
   * List approved contacts
   */
  async listApprovedContacts(limit: number = 1000): Promise<ApprovedContact[]> {
    await this.ensureConnected();

    const contacts: ApprovedContact[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        'PAIRING:approved:*',
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await this.client.mget(keys);
        for (const json of values) {
          if (json) {
            try {
              const parsed = JSON.parse(json);
              // Basic validation
              if (parsed && parsed.contactId && parsed.approvedAt) {
                contacts.push(parsed as ApprovedContact);
              }
            } catch {
              // Skip invalid entries
            }
          }
        }
      }

      if (contacts.length >= limit) break;
    } while (cursor !== '0');

    // Sort by approvedAt descending (newest first)
    return contacts.slice(0, limit).sort((a, b) => b.approvedAt - a.approvedAt);
  }

  /**
   * Get pending pairing request for a contact
   */
  async getPendingRequest(contactId: string): Promise<PairingRequest | null> {
    await this.ensureConnected();

    const json = await this.client.get(`PAIRING:pending:${contactId}`);
    if (!json) return null;

    try {
      return JSON.parse(json) as PairingRequest;
    } catch {
      return null;
    }
  }

  /**
   * Get approved contact record
   */
  async getApprovedContact(contactId: string): Promise<ApprovedContact | null> {
    await this.ensureConnected();

    const json = await this.client.get(`PAIRING:approved:${contactId}`);
    if (!json) return null;

    try {
      return JSON.parse(json) as ApprovedContact;
    } catch {
      return null;
    }
  }

  /**
   * Approve a contact (admin action)
   */
  async approveContact(
    contactId: string,
    approvedBy: string,
    tier: ContactTier = 'standard',
    notes?: string
  ): Promise<ApprovedContact> {
    await this.ensureConnected();

    // Get pending request to preserve contact info
    const pending = await this.getPendingRequest(contactId);

    const now = Date.now();
    const approved: ApprovedContact = {
      contactId,
      phoneNumber: pending?.phoneNumber || contactId.replace('@c.us', ''),
      ...(pending?.displayName && { displayName: pending.displayName }),
      ...(pending?.profilePicUrl && { profilePicUrl: pending.profilePicUrl }),
      approvedAt: now,
      approvedBy,
      tier,
      ...(notes && { notes }),
    };

    // Set approved (no TTL - permanent)
    await this.client.set(`PAIRING:approved:${contactId}`, JSON.stringify(approved));

    // Delete pending request if exists
    if (pending) {
      await this.client.del(`PAIRING:pending:${contactId}`);
    }

    console.log(`[Frontend Redis] Contact ${contactId} approved by ${approvedBy} (tier: ${tier})`);

    return approved;
  }

  /**
   * Deny a contact (admin action) - sets cooldown period
   */
  async denyContact(
    contactId: string,
    deniedBy: string,
    reason?: string,
    cooldownHours: number = 24
  ): Promise<void> {
    await this.ensureConnected();

    const pending = await this.getPendingRequest(contactId);

    const now = Date.now();
    const expiresAt = now + cooldownHours * 60 * 60 * 1000;
    const ttlSeconds = cooldownHours * 60 * 60;

    const denied = {
      contactId,
      phoneNumber: pending?.phoneNumber || contactId.replace('@c.us', ''),
      ...(pending?.displayName && { displayName: pending.displayName }),
      deniedAt: now,
      deniedBy,
      ...(reason && { reason }),
      expiresAt,
    };

    // Set denied with TTL
    await this.client.setex(`PAIRING:denied:${contactId}`, ttlSeconds, JSON.stringify(denied));

    // Delete pending request if exists
    if (pending) {
      await this.client.del(`PAIRING:pending:${contactId}`);
    }

    console.log(
      `[Frontend Redis] Contact ${contactId} denied by ${deniedBy} (cooldown: ${cooldownHours}h)`
    );
  }

  /**
   * Revoke approval (admin action)
   */
  async revokeApproval(contactId: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(`PAIRING:approved:${contactId}`);
    console.log(`[Frontend Redis] Approval revoked for ${contactId}`);
  }

  /**
   * Update approved contact tier
   */
  async updateContactTier(contactId: string, tier: ContactTier): Promise<ApprovedContact | null> {
    await this.ensureConnected();

    const contact = await this.getApprovedContact(contactId);
    if (!contact) return null;

    contact.tier = tier;
    await this.client.set(`PAIRING:approved:${contactId}`, JSON.stringify(contact));

    console.log(`[Frontend Redis] Updated tier for ${contactId} to ${tier}`);
    return contact;
  }

  /**
   * Check if contact is approved
   */
  async isContactApproved(contactId: string): Promise<boolean> {
    await this.ensureConnected();
    const exists = await this.client.exists(`PAIRING:approved:${contactId}`);
    return exists === 1;
  }
}

// Export singleton instance
export const redisClient = new RedisClient();
