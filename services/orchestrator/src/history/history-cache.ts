/**
 * Conversation History Cache
 * Retrieves and processes conversation history for RAG context
 *
 * Uses keyword-based chunking to select the most relevant messages
 * within the token budget.
 */

import { redisClient } from '../redis/client.js';
import { historyConfig, getHistoryKey } from '../config/history-config.js';
import { processMessagesWithChunking } from './keyword-chunker.js';
import {
  type StoredMessage,
  type ConversationMessage,
  type HistoryRetrievalResult,
  isStoredMessage,
} from '@secondme/shared-types';

// Re-export types for convenience
export type { StoredMessage, ConversationMessage, HistoryRetrievalResult };

/**
 * History Cache class for retrieving conversation context
 */
class HistoryCache {
  /**
   * Get conversation history for a contact
   * Applies keyword-based chunking to select relevant messages
   *
   * @param contactId - WhatsApp contact ID
   * @returns History retrieval result with messages for Claude API
   */
  async getRecentHistory(contactId: string): Promise<HistoryRetrievalResult> {
    // Check if feature is enabled
    if (!historyConfig.enabled) {
      console.log('[History Cache] Conversation history is disabled');
      return {
        messages: [],
        messageCount: 0,
        tokenEstimate: 0,
        method: 'disabled',
      };
    }

    const key = getHistoryKey(contactId);
    const { retrieval } = historyConfig;

    try {
      // Fetch messages from Redis (newest first)
      const rawMessages = await redisClient.client.zrevrange(
        key,
        0,
        retrieval.maxMessages - 1
      );

      if (rawMessages.length === 0) {
        console.log(`[History Cache] No history found for ${contactId}`);
        return {
          messages: [],
          messageCount: 0,
          tokenEstimate: 0,
          method: 'chunked',
        };
      }

      // Parse messages
      const storedMessages: StoredMessage[] = [];
      for (const json of rawMessages) {
        try {
          const parsed: unknown = JSON.parse(json);
          if (isStoredMessage(parsed)) {
            storedMessages.push(parsed);
          } else {
            console.error('[History Cache] Invalid message structure in Redis:', json);
          }
        } catch (parseError) {
          console.error('[History Cache] Error parsing message:', parseError);
        }
      }

      // Apply keyword chunking
      const maxAgeMs = retrieval.maxAgeHours * 60 * 60 * 1000;
      const processedMessages = processMessagesWithChunking(storedMessages, maxAgeMs);

      // Convert to Claude API format
      const messages: ConversationMessage[] = processedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Estimate tokens
      const tokenEstimate = messages.reduce(
        (sum, msg) => sum + Math.ceil(msg.content.length / 4) + 10,
        0
      );

      console.log(
        `[History Cache] Retrieved ${messages.length} messages for ${contactId} (~${tokenEstimate} tokens)`
      );

      return {
        messages,
        messageCount: messages.length,
        tokenEstimate,
        method: 'chunked',
      };
    } catch (error) {
      console.error(`[History Cache] Error retrieving history for ${contactId}:`, error);
      return {
        messages: [],
        messageCount: 0,
        tokenEstimate: 0,
        method: 'chunked',
      };
    }
  }

  /**
   * Get raw history without chunking (for debugging/analysis)
   *
   * @param contactId - WhatsApp contact ID
   * @param limit - Maximum messages to retrieve
   * @returns Raw stored messages
   */
  async getRawHistory(contactId: string, limit: number = 50): Promise<StoredMessage[]> {
    const key = getHistoryKey(contactId);

    try {
      const rawMessages = await redisClient.client.zrevrange(key, 0, limit - 1);

      const messages: StoredMessage[] = [];
      for (const json of rawMessages) {
        try {
          const parsed: unknown = JSON.parse(json);
          if (isStoredMessage(parsed)) {
            messages.push(parsed);
          }
          // Skip invalid messages silently in raw mode
        } catch {
          // Skip invalid messages
        }
      }

      return messages;
    } catch (error) {
      console.error(`[History Cache] Error getting raw history for ${contactId}:`, error);
      return [];
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
      console.error(`[History Cache] Error getting count for ${contactId}:`, error);
      return 0;
    }
  }

  /**
   * Check if history exists for a contact
   *
   * @param contactId - WhatsApp contact ID
   * @returns true if history exists
   */
  async hasHistory(contactId: string): Promise<boolean> {
    const count = await this.getHistoryCount(contactId);
    return count > 0;
  }
}

// Export singleton instance
export const historyCache = new HistoryCache();
