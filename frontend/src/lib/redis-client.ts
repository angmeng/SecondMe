/**
 * Redis Client for Server Actions
 * Used by Next.js Server Actions to interact with Redis for pause controls
 */

import Redis from 'ioredis';

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
   * Set contact-specific pause
   */
  async setContactPause(contactId: string, duration: number): Promise<void> {
    await this.ensureConnected();

    const expiresAt = Date.now() + duration * 1000;

    // Set pause with TTL
    await this.client.setex(`PAUSE:${contactId}`, duration, expiresAt.toString());

    console.log(`[Frontend Redis] Contact pause set: ${contactId} (duration: ${duration}s)`);
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

    // Check contact-specific pause
    const contactPause = await this.client.get(`PAUSE:${contactId}`);
    if (contactPause) {
      const expiresAt = parseInt(contactPause, 10);
      return Date.now() < expiresAt;
    }

    return false;
  }

  /**
   * Get contact pause expiration time
   */
  async getContactPauseExpiration(contactId: string): Promise<number | null> {
    await this.ensureConnected();

    const contactPause = await this.client.get(`PAUSE:${contactId}`);
    if (contactPause) {
      return parseInt(contactPause, 10);
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
}

// Export singleton instance
export const redisClient = new RedisClient();
