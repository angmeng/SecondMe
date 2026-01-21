/**
 * Conversation History Store
 * Stores messages to Redis Sorted Set for conversation history context
 *
 * Uses Sorted Set for:
 * - Natural ordering by timestamp (score)
 * - Efficient range queries (ZREVRANGE)
 * - Automatic deduplication via ZADD NX
 * - Easy trimming of old messages
 */

import { redisClient } from './client.js';
import { type StoredMessage, parseIntEnv, isStoredMessage } from '@secondme/shared-types';

// Re-export for convenience
export type { StoredMessage };

/**
 * Configuration for history storage
 * Values must match orchestrator's config for consistency
 */
const HISTORY_CONFIG = {
  keyPrefix: process.env['HISTORY_KEY_PREFIX'] || 'HISTORY:',
  maxMessages: parseIntEnv('HISTORY_MAX_MESSAGES', 100),
  ttlSeconds: parseIntEnv('HISTORY_TTL_SECONDS', 7 * 24 * 60 * 60),
};

/**
 * Get the Redis key for a contact's history
 */
function getHistoryKey(contactId: string): string {
  return `${HISTORY_CONFIG.keyPrefix}${contactId}`;
}

/**
 * History Store class for managing conversation history in Redis
 */
class HistoryStore {
  /**
   * Add a message to the conversation history
   * Uses Lua script for atomic operation: add + trim + TTL refresh
   *
   * @param contactId - WhatsApp contact ID
   * @param message - Message to store
   * @returns true if message was added, false if duplicate
   */
  async addMessage(contactId: string, message: StoredMessage): Promise<boolean> {
    const key = getHistoryKey(contactId);
    const messageJson = JSON.stringify(message);

    try {
      // Use Lua script for atomic operation
      const result = await this.addMessageAtomic(
        key,
        messageJson,
        message.timestamp,
        message.id,
        HISTORY_CONFIG.maxMessages,
        HISTORY_CONFIG.ttlSeconds
      );

      if (result === 1) {
        console.log(
          `[History Store] Added message ${message.id} for ${contactId} (${message.role})`
        );
        return true;
      } else {
        console.log(
          `[History Store] Duplicate message ${message.id} for ${contactId}, skipped`
        );
        return false;
      }
    } catch (error) {
      console.error(`[History Store] Error adding message for ${contactId}:`, error);
      // Don't throw - history storage shouldn't block message flow
      return false;
    }
  }

  /**
   * Atomic add message operation using Lua script
   * Handles: duplicate check, add, trim, TTL refresh
   */
  private async addMessageAtomic(
    key: string,
    messageJson: string,
    timestamp: number,
    messageId: string,
    maxMessages: number,
    ttlSeconds: number
  ): Promise<number> {
    // Lua script for atomic Redis operation
    // Uses a separate Set (key:ids) for O(1) duplicate detection by message ID
    // Note: Redis eval() is the standard way to run Lua scripts atomically - this is safe
    const luaScript = `
      local key = KEYS[1]
      local idsKey = KEYS[2]
      local messageJson = ARGV[1]
      local timestamp = tonumber(ARGV[2])
      local messageId = ARGV[3]
      local maxMessages = tonumber(ARGV[4])
      local ttlSeconds = tonumber(ARGV[5])

      -- Check for duplicate using separate IDs set (O(1) lookup)
      if redis.call('SISMEMBER', idsKey, messageId) == 1 then
        return 0  -- Duplicate found
      end

      -- Add message ID to the IDs set
      redis.call('SADD', idsKey, messageId)

      -- Add message with timestamp as score
      redis.call('ZADD', key, timestamp, messageJson)

      -- Trim messages to max (keep most recent)
      local count = redis.call('ZCARD', key)
      if count > maxMessages then
        -- Get messages to be removed
        local toRemove = redis.call('ZRANGE', key, 0, count - maxMessages - 1)

        -- Extract message IDs from removed messages and remove from IDs set
        for _, msg in ipairs(toRemove) do
          -- Extract ID from JSON (pattern: "id":"<value>")
          local id = string.match(msg, '"id":"([^"]+)"')
          if id then
            redis.call('SREM', idsKey, id)
          end
        end

        -- Remove old messages from sorted set
        redis.call('ZREMRANGEBYRANK', key, 0, count - maxMessages - 1)
      end

      -- Refresh TTL on both keys
      redis.call('EXPIRE', key, ttlSeconds)
      redis.call('EXPIRE', idsKey, ttlSeconds)

      return 1  -- Success
    `;

    const idsKey = `${key}:ids`;

    // Redis eval runs Lua scripts atomically - this is the standard Redis pattern
    const result = await redisClient.client.eval(
      luaScript,
      2, // Now using 2 keys
      key,
      idsKey,
      messageJson,
      timestamp.toString(),
      messageId,
      maxMessages.toString(),
      ttlSeconds.toString()
    );

    return result as number;
  }

  /**
   * Get recent history for a contact
   * Returns messages in reverse chronological order (newest first)
   *
   * @param contactId - WhatsApp contact ID
   * @param limit - Maximum number of messages to retrieve
   * @returns Array of stored messages (newest first)
   */
  async getHistory(contactId: string, limit: number = 50): Promise<StoredMessage[]> {
    const key = getHistoryKey(contactId);

    try {
      // Get most recent messages (ZREVRANGE returns newest first)
      const results = await redisClient.client.zrevrange(key, 0, limit - 1);

      const messages: StoredMessage[] = [];
      for (const json of results) {
        try {
          const parsed: unknown = JSON.parse(json);
          if (isStoredMessage(parsed)) {
            messages.push(parsed);
          } else {
            console.error(`[History Store] Invalid message structure in Redis:`, json);
          }
        } catch (parseError) {
          console.error(`[History Store] Error parsing message JSON:`, parseError);
        }
      }

      return messages;
    } catch (error) {
      console.error(`[History Store] Error getting history for ${contactId}:`, error);
      return [];
    }
  }

  /**
   * Clear history for a contact
   *
   * @param contactId - WhatsApp contact ID
   */
  async clearHistory(contactId: string): Promise<void> {
    const key = getHistoryKey(contactId);
    const idsKey = `${key}:ids`;

    try {
      // Delete both the messages sorted set and the IDs set
      await redisClient.client.del(key, idsKey);
      console.log(`[History Store] Cleared history for ${contactId}`);
    } catch (error) {
      console.error(`[History Store] Error clearing history for ${contactId}:`, error);
    }
  }

  /**
   * Get history count for a contact
   *
   * @param contactId - WhatsApp contact ID
   * @returns Number of messages in history
   */
  async getHistoryCount(contactId: string): Promise<number> {
    const key = getHistoryKey(contactId);

    try {
      return await redisClient.client.zcard(key);
    } catch (error) {
      console.error(`[History Store] Error getting count for ${contactId}:`, error);
      return 0;
    }
  }

  /**
   * Get history within a time range
   *
   * @param contactId - WhatsApp contact ID
   * @param fromTimestamp - Start timestamp (inclusive)
   * @param toTimestamp - End timestamp (inclusive)
   * @returns Array of stored messages in the range
   */
  async getHistoryByTimeRange(
    contactId: string,
    fromTimestamp: number,
    toTimestamp: number
  ): Promise<StoredMessage[]> {
    const key = getHistoryKey(contactId);

    try {
      const results = await redisClient.client.zrangebyscore(
        key,
        fromTimestamp,
        toTimestamp
      );

      const messages: StoredMessage[] = [];
      for (const json of results) {
        try {
          const parsed: unknown = JSON.parse(json);
          if (isStoredMessage(parsed)) {
            messages.push(parsed);
          } else {
            console.error(`[History Store] Invalid message structure in Redis:`, json);
          }
        } catch (parseError) {
          console.error(`[History Store] Error parsing message JSON:`, parseError);
        }
      }

      return messages;
    } catch (error) {
      console.error(`[History Store] Error getting history range for ${contactId}:`, error);
      return [];
    }
  }
}

// Export singleton instance
export const historyStore = new HistoryStore();
