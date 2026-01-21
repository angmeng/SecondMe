/**
 * Redis Client for Graph Worker Service
 * Handles chat history queue consumption
 */

import { Redis } from 'ioredis';

const REDIS_HOST = process.env['REDIS_HOST'] || 'localhost';
const REDIS_PORT = parseInt(process.env['REDIS_PORT'] || '6380', 10);
const REDIS_PASSWORD = process.env['REDIS_PASSWORD'];
const CHAT_HISTORY_QUEUE = 'QUEUE:chat_history';

class RedisClient {
  public client: Redis;

  constructor() {
    this.client = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`[Graph Worker Redis] Retrying connection... (${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    // Event handlers
    this.client.on('connect', () => {
      console.log('[Graph Worker Redis] Connected to Redis');
    });

    this.client.on('error', (err: Error) => {
      console.error('[Graph Worker Redis] Redis client error:', err);
    });

    this.client.on('close', () => {
      console.log('[Graph Worker Redis] Redis connection closed');
    });
  }

  async connect(): Promise<void> {
    await this.client.ping();
    console.log('[Graph Worker Redis] Redis client connected');
  }

  async quit(): Promise<void> {
    await this.client.quit();
    console.log('[Graph Worker Redis] Redis client disconnected');
  }

  get status(): string {
    return this.client.status;
  }

  /**
   * Consume chat history from Redis stream (XREAD)
   */
  async consumeChatHistory(
    lastId: string = '$',
    blockMs: number = 5000
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    const results = await this.client.xread(
      'BLOCK',
      blockMs,
      'STREAMS',
      CHAT_HISTORY_QUEUE,
      lastId
    );

    if (!results || results.length === 0) {
      return [];
    }

    const messages: Array<{ id: string; fields: Record<string, string> }> = [];

    for (const [_streamName, entries] of results) {
      for (const [id, fieldArray] of entries) {
        // Convert field array [k1, v1, k2, v2] to object {k1: v1, k2: v2}
        const fields: Record<string, string> = {};
        for (let i = 0; i < fieldArray.length; i += 2) {
          const key = fieldArray[i];
          const value = fieldArray[i + 1];
          if (key !== undefined && value !== undefined) {
            fields[key] = value;
          }
        }
        messages.push({ id, fields });
      }
    }

    return messages;
  }

  /**
   * Delete chat history item from stream after processing
   */
  async deleteChatHistory(id: string): Promise<void> {
    await this.client.xdel(CHAT_HISTORY_QUEUE, id);
  }

  /**
   * Add chat history item to stream (used by Gateway for initial history ingestion)
   */
  async addChatHistory(
    contactId: string,
    content: string,
    timestamp: number,
    metadata?: Record<string, string>
  ): Promise<void> {
    const fields: Record<string, string> = {
      contactId,
      content,
      timestamp: timestamp.toString(),
      ...metadata,
    };

    const fieldArray: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      fieldArray.push(key, value);
    }

    await this.client.xadd(CHAT_HISTORY_QUEUE, '*', ...fieldArray);
  }
}

// Export singleton instance
export const redisClient = new RedisClient();
