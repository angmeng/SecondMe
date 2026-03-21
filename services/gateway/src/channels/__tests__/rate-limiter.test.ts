/**
 * Rate Limiter Tests
 * Unit tests for channel-agnostic rate limiting
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../rate-limiter.js';
import type { RateLimiterDeps, ChannelLogger } from '../types.js';

describe('RateLimiter', () => {
  // Mock Redis client
  let mockRedis: {
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    eval: ReturnType<typeof vi.fn>;
  };

  // Mock logger
  let mockLogger: ChannelLogger;

  // Mock event emitter
  let mockEmitEvent: ReturnType<typeof vi.fn>;

  // Mock publish
  let mockPublish: ReturnType<typeof vi.fn>;

  // Dependencies
  let deps: RateLimiterDeps;

  beforeEach(() => {
    mockRedis = {
      incr: vi.fn(),
      expire: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      set: vi.fn(),
      eval: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockEmitEvent = vi.fn();
    mockPublish = vi.fn().mockResolvedValue(undefined);

    deps = {
      redis: mockRedis,
      logger: mockLogger,
      emitEvent: mockEmitEvent,
      publish: mockPublish,
    };
  });

  describe('check', () => {
    it('should allow message when under threshold', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const rateLimiter = new RateLimiter(deps);
      const result = await rateLimiter.check('contact123');

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(1);
      expect(result.threshold).toBe(10);
      expect(result.windowSeconds).toBe(60);
      expect(result.autoPaused).toBe(false);
    });

    it('should use atomic Lua script for increment with TTL', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.check('contact123');

      // Verify Lua script is called with correct arguments
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('INCR'),
        1,
        'COUNTER:contact123:msgs',
        60
      );
    });

    it('should deny message when threshold exceeded', async () => {
      mockRedis.eval.mockResolvedValue(11);
      mockRedis.set.mockResolvedValue('OK');

      const rateLimiter = new RateLimiter(deps);
      const result = await rateLimiter.check('contact123');

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(11);
      expect(result.autoPaused).toBe(true);
    });

    it('should trigger auto-pause when threshold exceeded', async () => {
      mockRedis.eval.mockResolvedValue(11);
      mockRedis.set.mockResolvedValue('OK');

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.check('contact123');

      // Should set pause state
      expect(mockRedis.set).toHaveBeenCalledWith(
        'PAUSE:contact123',
        expect.stringContaining('"reason":"rate_limit"')
      );

      // Should publish event
      expect(mockPublish).toHaveBeenCalledWith(
        'events:pause',
        expect.stringContaining('"action":"pause"')
      );

      // Should emit socket event
      expect(mockEmitEvent).toHaveBeenCalledWith('rate_limit', expect.objectContaining({
        contactId: 'contact123',
        count: 11,
        threshold: 10,
      }));
    });

    it('should include channelId in events when provided', async () => {
      mockRedis.eval.mockResolvedValue(11);
      mockRedis.set.mockResolvedValue('OK');

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.check('contact123', { channelId: 'whatsapp' });

      // Should include channelId in publish
      expect(mockPublish).toHaveBeenCalledWith(
        'events:pause',
        expect.stringContaining('"channelId":"whatsapp"')
      );

      // Should include channelId in socket event
      expect(mockEmitEvent).toHaveBeenCalledWith('rate_limit', expect.objectContaining({
        channelId: 'whatsapp',
      }));
    });

    it('should not auto-pause when autoPause is disabled', async () => {
      mockRedis.eval.mockResolvedValue(11);

      const rateLimiter = new RateLimiter(deps, { autoPause: false });
      const result = await rateLimiter.check('contact123');

      expect(result.allowed).toBe(false);
      expect(result.autoPaused).toBe(false);
      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockPublish).not.toHaveBeenCalled();
      expect(mockEmitEvent).not.toHaveBeenCalled();
    });

    it('should use custom threshold and window', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const rateLimiter = new RateLimiter(deps, { threshold: 5, windowSeconds: 30 });
      const result = await rateLimiter.check('contact123');

      expect(result.threshold).toBe(5);
      expect(result.windowSeconds).toBe(30);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'COUNTER:contact123:msgs',
        30
      );
    });

    it('should fail open when Redis errors', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection failed'));

      const rateLimiter = new RateLimiter(deps);
      const result = await rateLimiter.check('contact123');

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log warning with masked contact ID when rate limited', async () => {
      mockRedis.eval.mockResolvedValue(15);
      mockRedis.set.mockResolvedValue('OK');

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.check('1234567890@c.us');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Rate limit exceeded for 1234****90@c.us',
        expect.objectContaining({ contactId: '1234****90@c.us', count: 15 })
      );
    });
  });

  describe('reset', () => {
    it('should delete counter and pause keys', async () => {
      mockRedis.del.mockResolvedValue(2);

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.reset('contact123');

      expect(mockRedis.del).toHaveBeenCalledWith(
        'COUNTER:contact123:msgs',
        'PAUSE:contact123'
      );
    });

    it('should only delete counter when clearPause is false', async () => {
      mockRedis.del.mockResolvedValue(1);

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.reset('contact123', false);

      expect(mockRedis.del).toHaveBeenCalledWith('COUNTER:contact123:msgs');
    });

    it('should emit resume event when clearing pause', async () => {
      mockRedis.del.mockResolvedValue(2);

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.reset('contact123', true, 'whatsapp');

      // Should publish resume event
      expect(mockPublish).toHaveBeenCalledWith(
        'events:pause',
        expect.stringContaining('"action":"resume"')
      );
      expect(mockPublish).toHaveBeenCalledWith(
        'events:pause',
        expect.stringContaining('"channelId":"whatsapp"')
      );

      // Should emit pause_update socket event
      expect(mockEmitEvent).toHaveBeenCalledWith('pause_update', expect.objectContaining({
        contactId: 'contact123',
        channelId: 'whatsapp',
        action: 'resume',
        reason: 'rate_limit_reset',
      }));
    });

    it('should not emit resume event when clearPause is false', async () => {
      mockRedis.del.mockResolvedValue(1);

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.reset('contact123', false);

      expect(mockPublish).not.toHaveBeenCalled();
      expect(mockEmitEvent).not.toHaveBeenCalled();
    });

    it('should log with masked contact ID on successful reset', async () => {
      mockRedis.del.mockResolvedValue(1);

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.reset('1234567890@c.us');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Rate limit reset for 1234****90@c.us',
        expect.objectContaining({ contactId: '1234****90@c.us' })
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.reset('contact123');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getCount', () => {
    it('should return current count', async () => {
      mockRedis.get.mockResolvedValue('5');

      const rateLimiter = new RateLimiter(deps);
      const count = await rateLimiter.getCount('contact123');

      expect(count).toBe(5);
      expect(mockRedis.get).toHaveBeenCalledWith('COUNTER:contact123:msgs');
    });

    it('should return 0 when no counter exists', async () => {
      mockRedis.get.mockResolvedValue(null);

      const rateLimiter = new RateLimiter(deps);
      const count = await rateLimiter.getCount('contact123');

      expect(count).toBe(0);
    });

    it('should return 0 on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const rateLimiter = new RateLimiter(deps);
      const count = await rateLimiter.getCount('contact123');

      expect(count).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getConfig', () => {
    it('should return default config', () => {
      const rateLimiter = new RateLimiter(deps);
      const config = rateLimiter.getConfig();

      expect(config).toEqual({
        threshold: 10,
        windowSeconds: 60,
        autoPause: true,
      });
    });

    it('should return custom config', () => {
      const rateLimiter = new RateLimiter(deps, {
        threshold: 5,
        windowSeconds: 30,
        autoPause: false,
      });
      const config = rateLimiter.getConfig();

      expect(config).toEqual({
        threshold: 5,
        windowSeconds: 30,
        autoPause: false,
      });
    });

    it('should return a copy not the original', () => {
      const rateLimiter = new RateLimiter(deps);
      const config1 = rateLimiter.getConfig();
      const config2 = rateLimiter.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('contact ID masking', () => {
    it('should mask WhatsApp format contact IDs', async () => {
      mockRedis.get.mockRejectedValue(new Error('test error'));

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.getCount('1234567890@c.us');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ contactId: '1234****90@c.us' })
      );
    });

    it('should mask Telegram format contact IDs', async () => {
      mockRedis.get.mockRejectedValue(new Error('test error'));

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.getCount('user_123456789');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ contactId: 'user****89' })
      );
    });

    it('should not mask short contact IDs', async () => {
      mockRedis.get.mockRejectedValue(new Error('test error'));

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.getCount('abc');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ contactId: 'abc' })
      );
    });

    it('should handle short phone with @ suffix', async () => {
      mockRedis.get.mockRejectedValue(new Error('test error'));

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.getCount('123@c.us');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ contactId: '123@c.us' })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle exactly at threshold (not exceeded)', async () => {
      mockRedis.eval.mockResolvedValue(10);

      const rateLimiter = new RateLimiter(deps);
      const result = await rateLimiter.check('contact123');

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(10);
    });

    it('should handle contact IDs with special characters', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.check('user@example.com');

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'COUNTER:user@example.com:msgs',
        60
      );
    });

    it('should handle empty contact ID', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const rateLimiter = new RateLimiter(deps);
      const result = await rateLimiter.check('');

      expect(result.allowed).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'COUNTER::msgs',
        60
      );
    });

    it('should handle undefined channelId gracefully', async () => {
      mockRedis.eval.mockResolvedValue(11);
      mockRedis.set.mockResolvedValue('OK');

      const rateLimiter = new RateLimiter(deps);
      await rateLimiter.check('contact123', {}); // Empty options

      // channelId should be undefined in the event
      expect(mockEmitEvent).toHaveBeenCalledWith('rate_limit', expect.objectContaining({
        contactId: 'contact123',
        channelId: undefined,
      }));
    });
  });
});
