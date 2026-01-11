/**
 * Redis Client for Orchestrator Service
 * Handles message queue consumption, state management, and caching
 */

import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

class RedisClient {
  public client: Redis;
  public subscriber: Redis;
  public publisher: Redis;

  constructor() {
    // Main client for general operations
    this.client = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`[Orchestrator Redis] Retrying connection... (${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    // Dedicated subscriber client for pub/sub
    this.subscriber = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
    });

    // Dedicated publisher client for pub/sub
    this.publisher = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
    });

    // Event handlers
    this.client.on('connect', () => {
      console.log('[Orchestrator Redis] Connected to Redis');
    });

    this.client.on('error', (err) => {
      console.error('[Orchestrator Redis] Redis client error:', err);
    });

    this.client.on('close', () => {
      console.log('[Orchestrator Redis] Redis connection closed');
    });
  }

  async connect(): Promise<void> {
    await this.client.ping();
    await this.subscriber.ping();
    await this.publisher.ping();
    console.log('[Orchestrator Redis] All Redis clients connected');
  }

  async quit(): Promise<void> {
    await this.client.quit();
    await this.subscriber.quit();
    await this.publisher.quit();
    console.log('[Orchestrator Redis] All Redis clients disconnected');
  }

  get status(): string {
    return this.client.status;
  }

  /**
   * Publish message to Redis pub/sub channel
   */
  async publish(channel: string, message: string): Promise<void> {
    await this.publisher.publish(channel, message);
  }

  /**
   * Subscribe to Redis pub/sub channel
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    this.subscriber.subscribe(channel, (err, count) => {
      if (err) {
        console.error(`[Orchestrator Redis] Failed to subscribe to ${channel}:`, err);
      } else {
        console.log(`[Orchestrator Redis] Subscribed to ${channel} (${count} total)`);
      }
    });

    this.subscriber.on('message', (chan, msg) => {
      if (chan === channel) {
        callback(msg);
      }
    });
  }

  /**
   * Check if contact is paused (global or contact-specific)
   */
  async isPaused(contactId: string): Promise<boolean> {
    // Check global pause first
    const globalPause = await this.client.exists('PAUSE:ALL');
    if (globalPause) {
      return true;
    }

    // Check contact-specific pause
    const contactPause = await this.client.get(`PAUSE:${contactId}`);
    if (contactPause) {
      const expiresAt = parseInt(contactPause, 10);
      return Date.now() < expiresAt;
    }

    return false;
  }

  /**
   * Check rate limit for contact
   */
  async checkRateLimit(contactId: string): Promise<boolean> {
    const key = `COUNTER:${contactId}:msgs`;
    const count = await this.client.incr(key);

    if (count === 1) {
      await this.client.expire(key, 60); // Set TTL on first increment
    }

    if (count > 10) {
      // Trigger auto-pause
      const expiresAt = Date.now() + 3600000; // 1 hour
      await this.client.setex(`PAUSE:${contactId}`, 3600, expiresAt.toString());

      await this.publish('events:pause', JSON.stringify({
        contactId,
        action: 'pause',
        reason: 'rate_limit',
        expiresAt,
        timestamp: Date.now(),
      }));

      console.log(`[Orchestrator Redis] Rate limit exceeded for ${contactId}, auto-paused`);
      return false;
    }

    return true;
  }

  /**
   * Get persona from cache or return null
   */
  async getPersonaCache(personaId: string): Promise<any | null> {
    const cached = await this.client.get(`CACHE:persona:${personaId}`);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  }

  /**
   * Set persona cache with 30-minute TTL
   */
  async setPersonaCache(personaId: string, persona: any): Promise<void> {
    await this.client.setex(
      `CACHE:persona:${personaId}`,
      1800, // 30 minutes
      JSON.stringify(persona)
    );
  }

  /**
   * Consume messages from Redis stream (XREAD)
   */
  async consumeMessages(
    stream: string,
    lastId: string = '$',
    blockMs: number = 5000
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    const results = await this.client.xread(
      'BLOCK',
      blockMs,
      'STREAMS',
      stream,
      lastId
    );

    if (!results || results.length === 0) {
      return [];
    }

    const messages: Array<{ id: string; fields: Record<string, string> }> = [];

    for (const [streamName, entries] of results) {
      for (const [id, fieldArray] of entries) {
        // Convert field array [k1, v1, k2, v2] to object {k1: v1, k2: v2}
        const fields: Record<string, string> = {};
        for (let i = 0; i < fieldArray.length; i += 2) {
          fields[fieldArray[i]] = fieldArray[i + 1];
        }
        messages.push({ id, fields });
      }
    }

    return messages;
  }

  /**
   * Delete message from stream after processing
   */
  async deleteMessage(stream: string, id: string): Promise<void> {
    await this.client.xdel(stream, id);
  }
}

// Export singleton instance
export const redisClient = new RedisClient();
