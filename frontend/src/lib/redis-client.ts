/**
 * Redis Client for Server Actions
 * Used by Next.js Server Actions to interact with Redis for pause controls
 */

import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

class RedisClient {
  private client: Redis;
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
