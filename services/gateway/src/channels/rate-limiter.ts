/**
 * Rate Limiter
 * Channel-agnostic rate limiting for message processing
 *
 * Extracted from WhatsApp message-handler.ts to support multi-channel architecture.
 * Uses Redis for distributed rate limiting with configurable thresholds.
 */

import type {
  RateLimiterConfig,
  RateLimiterDeps,
  RateLimitResult,
  RateLimitCheckOptions,
} from './types.js';
import { DEFAULT_RATE_LIMITER_CONFIG } from './types.js';

/**
 * Lua script for atomic increment with TTL on first message.
 * Prevents race condition where two simultaneous first messages
 * could both try to set TTL.
 *
 * KEYS[1] = counter key
 * ARGV[1] = TTL in seconds
 *
 * Returns the new count after increment
 *
 * Note: This uses Redis EVAL command (Lua scripting), NOT JavaScript eval.
 * Redis Lua scripts are safe and run atomically on the Redis server.
 */
const ATOMIC_INCR_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * Rate limiter for controlling message frequency per contact
 *
 * Features:
 * - Sliding window rate limiting using Redis TTL
 * - Atomic increment with TTL (prevents race conditions)
 * - Configurable threshold and window size
 * - Optional auto-pause on threshold exceeded
 * - Distributed across gateway instances via Redis
 * - Multi-channel support with channelId in events
 *
 * @example
 * ```typescript
 * const rateLimiter = new RateLimiter({
 *   redis: redisClient.client,
 *   logger,
 *   emitEvent: (event, data) => io.emit(event, data),
 *   publish: (channel, msg) => redisClient.publish(channel, msg),
 * });
 *
 * const result = await rateLimiter.check('contact123', { channelId: 'whatsapp' });
 * if (!result.allowed) {
 *   console.log('Rate limited!', result);
 * }
 * ```
 */
export class RateLimiter {
  private readonly deps: RateLimiterDeps;
  private readonly config: Required<RateLimiterConfig>;

  constructor(deps: RateLimiterDeps, config?: RateLimiterConfig) {
    this.deps = deps;
    this.config = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config };
  }

  /**
   * Generate the Redis key for a contact's message counter
   */
  private getCounterKey(contactId: string): string {
    return `COUNTER:${contactId}:msgs`;
  }

  /**
   * Generate the Redis key for a contact's pause state
   */
  private getPauseKey(contactId: string): string {
    return `PAUSE:${contactId}`;
  }

  /**
   * Mask contact ID for privacy in logs
   * Example: '1234567890@c.us' -> '1234****90@c.us'
   */
  private maskContactId(contactId: string): string {
    // Handle WhatsApp format: number@c.us
    const atIndex = contactId.indexOf('@');
    if (atIndex > 0) {
      const phone = contactId.slice(0, atIndex);
      const suffix = contactId.slice(atIndex);
      if (phone.length <= 6) return contactId;
      return phone.slice(0, 4) + '****' + phone.slice(-2) + suffix;
    }
    // Handle other formats
    if (contactId.length <= 6) return contactId;
    return contactId.slice(0, 4) + '****' + contactId.slice(-2);
  }

  /**
   * Check if a message from a contact is allowed (increments counter)
   *
   * @param contactId - The contact identifier to check
   * @param options - Optional settings including channelId for multi-channel support
   * @returns Rate limit result indicating if message is allowed
   */
  async check(contactId: string, options?: RateLimitCheckOptions): Promise<RateLimitResult> {
    const { threshold, windowSeconds, autoPause } = this.config;
    const key = this.getCounterKey(contactId);
    const channelId = options?.channelId;

    try {
      // Atomic increment with TTL using Lua script (prevents race condition)
      // Note: This is Redis EVAL (Lua scripting), not JavaScript eval
      const count = await this.deps.redis.eval(
        ATOMIC_INCR_WITH_TTL,
        1,
        key,
        windowSeconds
      ) as number;

      // Check if threshold exceeded
      if (count > threshold) {
        let autoPaused = false;

        if (autoPause) {
          autoPaused = await this.triggerAutoPause(contactId, count, channelId);
        }

        this.deps.logger.warn(`Rate limit exceeded for ${this.maskContactId(contactId)}`, {
          contactId: this.maskContactId(contactId),
          channelId,
          count,
          threshold,
          autoPaused,
        });

        return {
          allowed: false,
          currentCount: count,
          threshold,
          windowSeconds,
          autoPaused,
        };
      }

      return {
        allowed: true,
        currentCount: count,
        threshold,
        windowSeconds,
        autoPaused: false,
      };
    } catch (error) {
      // Log error but don't block message on Redis failure
      this.deps.logger.error('Error checking rate limit', {
        contactId: this.maskContactId(contactId),
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fail open - allow message if Redis fails
      return {
        allowed: true,
        currentCount: 0,
        threshold,
        windowSeconds,
        autoPaused: false,
      };
    }
  }

  /**
   * Trigger auto-pause for a rate-limited contact
   */
  private async triggerAutoPause(
    contactId: string,
    count: number,
    channelId?: string
  ): Promise<boolean> {
    const pausedAt = Date.now();
    const pauseKey = this.getPauseKey(contactId);

    try {
      // Set pause state (indefinite - no TTL)
      await this.deps.redis.set(
        pauseKey,
        JSON.stringify({ pausedAt, reason: 'rate_limit' })
      );

      // Publish pause event to Redis pub/sub
      await this.deps.publish(
        'events:pause',
        JSON.stringify({
          contactId,
          channelId,
          action: 'pause',
          reason: 'rate_limit',
          count,
          threshold: this.config.threshold,
          pausedAt,
          timestamp: Date.now(),
        })
      );

      // Emit to frontend via socket.io
      this.deps.emitEvent('rate_limit', {
        contactId,
        channelId,
        count,
        threshold: this.config.threshold,
        pausedAt,
        timestamp: Date.now(),
      });

      return true;
    } catch (error) {
      this.deps.logger.error('Error triggering auto-pause', {
        contactId: this.maskContactId(contactId),
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Reset rate limit counter for a contact
   * Optionally clears pause state as well and emits resume event
   *
   * @param contactId - The contact identifier to reset
   * @param clearPause - Whether to also clear pause state (default: true)
   * @param channelId - Optional channel ID for multi-channel support
   */
  async reset(
    contactId: string,
    clearPause: boolean = true,
    channelId?: string
  ): Promise<void> {
    const counterKey = this.getCounterKey(contactId);
    const keys = [counterKey];

    if (clearPause) {
      keys.push(this.getPauseKey(contactId));
    }

    try {
      await this.deps.redis.del(...keys);

      this.deps.logger.info(`Rate limit reset for ${this.maskContactId(contactId)}`, {
        contactId: this.maskContactId(contactId),
        channelId,
        clearedPause: clearPause,
      });

      // Emit resume event if pause was cleared
      if (clearPause) {
        await this.deps.publish(
          'events:pause',
          JSON.stringify({
            contactId,
            channelId,
            action: 'resume',
            reason: 'rate_limit_reset',
            timestamp: Date.now(),
          })
        );

        this.deps.emitEvent('pause_update', {
          contactId,
          channelId,
          action: 'resume',
          reason: 'rate_limit_reset',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      this.deps.logger.error('Error resetting rate limit', {
        contactId: this.maskContactId(contactId),
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current message count without incrementing
   *
   * @param contactId - The contact identifier to check
   * @returns Current message count (0 if no messages in window)
   */
  async getCount(contactId: string): Promise<number> {
    const key = this.getCounterKey(contactId);

    try {
      const value = await this.deps.redis.get(key);
      return value ? parseInt(value, 10) : 0;
    } catch (error) {
      this.deps.logger.error('Error getting rate limit count', {
        contactId: this.maskContactId(contactId),
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): Required<RateLimiterConfig> {
    return { ...this.config };
  }
}
