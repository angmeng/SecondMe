/**
 * Redis Client for Gateway Service
 * Handles connection to Redis for pub/sub, state management, and message queues
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
        console.log(`[Gateway Redis] Retrying connection... (${times})`);
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
      console.log('[Gateway Redis] Connected to Redis');
    });

    this.client.on('error', (err) => {
      console.error('[Gateway Redis] Redis client error:', err);
    });

    this.client.on('close', () => {
      console.log('[Gateway Redis] Redis connection closed');
    });
  }

  async connect(): Promise<void> {
    await this.client.ping();
    await this.subscriber.ping();
    await this.publisher.ping();
    console.log('[Gateway Redis] All Redis clients connected');
  }

  async quit(): Promise<void> {
    await this.client.quit();
    await this.subscriber.quit();
    await this.publisher.quit();
    console.log('[Gateway Redis] All Redis clients disconnected');
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
        console.error(`[Gateway Redis] Failed to subscribe to ${channel}:`, err);
      } else {
        console.log(`[Gateway Redis] Subscribed to ${channel} (${count} total)`);
      }
    });

    this.subscriber.on('message', (chan, msg) => {
      if (chan === channel) {
        callback(msg);
      }
    });
  }

  /**
   * Check if contact is paused
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
   * Set pause state for contact
   */
  async setPause(contactId: string, durationSeconds: number = 3600): Promise<void> {
    const expiresAt = Date.now() + durationSeconds * 1000;
    await this.client.setex(`PAUSE:${contactId}`, durationSeconds, expiresAt.toString());

    // Publish pause event
    await this.publish('events:pause', JSON.stringify({
      contactId,
      action: 'pause',
      expiresAt,
      timestamp: Date.now(),
    }));
  }

  /**
   * Clear pause state for contact
   */
  async clearPause(contactId: string): Promise<void> {
    await this.client.del(`PAUSE:${contactId}`);

    // Publish resume event
    await this.publish('events:pause', JSON.stringify({
      contactId,
      action: 'resume',
      timestamp: Date.now(),
    }));
  }

  /**
   * Queue message to Redis stream for Orchestrator to process
   */
  async queueMessage(messageData: {
    messageId: string;
    contactId: string;
    contactName: string;
    content: string;
    timestamp: number;
    hasMedia: boolean;
    type: string;
  }): Promise<void> {
    const payload = JSON.stringify(messageData);

    // Add to QUEUE:messages stream
    await this.client.xadd(
      'QUEUE:messages',
      '*', // Auto-generate ID
      'payload',
      payload
    );

    console.log(`[Gateway Redis] Message queued: ${messageData.messageId}`);
  }

  /**
   * Queue response from Orchestrator to be sent
   */
  async queueResponse(responseData: {
    contactId: string;
    content: string;
    timestamp: number;
    typingDelay?: number;
  }): Promise<void> {
    const payload = JSON.stringify(responseData);

    // Add to QUEUE:responses stream
    await this.client.xadd(
      'QUEUE:responses',
      '*',
      'payload',
      payload
    );

    console.log(`[Gateway Redis] Response queued for ${responseData.contactId}`);
  }

  /**
   * Consume responses from Orchestrator
   */
  async consumeResponses(
    lastId: string = '$',
    blockMs: number = 5000
  ): Promise<Array<{ id: string; payload: any }>> {
    const results = await this.client.xread(
      'BLOCK',
      blockMs,
      'STREAMS',
      'QUEUE:responses',
      lastId
    );

    if (!results || results.length === 0) {
      return [];
    }

    const responses: Array<{ id: string; payload: any }> = [];

    for (const [streamName, entries] of results) {
      for (const [id, fieldArray] of entries) {
        // fieldArray is ['payload', '{...}']
        const payloadJson = fieldArray[1];
        const payload = JSON.parse(payloadJson);
        responses.push({ id, payload });
      }
    }

    return responses;
  }

  /**
   * Delete response from stream after processing
   */
  async deleteResponse(id: string): Promise<void> {
    await this.client.xdel('QUEUE:responses', id);
  }
}

// Export singleton instance
export const redisClient = new RedisClient();
