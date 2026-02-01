/**
 * Voice Cache Tests
 * Task 4.1.2: Per-contact TTS preferences
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VoicePreference } from '@secondme/shared-types';

// Mock the redis client before importing the module
vi.mock('../client.js', () => ({
  redisClient: {
    client: {
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
    },
  },
}));

// Import after mocking
import { voiceCache, getVoicePreferenceWithCache, getDefaultVoicePreference } from '../voice-cache.js';
import { redisClient } from '../client.js';

describe('VoiceCache', () => {
  const mockRedis = redisClient.client as {
    get: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('should return cached voice preference on hit', async () => {
      const preference: VoicePreference = {
        enabled: true,
        voiceId: 'voice-123',
        maxCharacters: 500,
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(preference));

      const result = await voiceCache.get('contact-123');

      expect(result).toEqual(preference);
      expect(mockRedis.get).toHaveBeenCalledWith('CACHE:voice:contact-123');
    });

    it('should return null on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await voiceCache.get('contact-456');

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith('CACHE:voice:contact-456');
    });

    it('should invalidate and return null for invalid cached data', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ invalid: 'data' }));
      mockRedis.del.mockResolvedValue(1);

      const result = await voiceCache.get('contact-789');

      expect(result).toBeNull();
      expect(mockRedis.del).toHaveBeenCalledWith('CACHE:voice:contact-789');
    });

    it('should return null on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await voiceCache.get('contact-error');

      expect(result).toBeNull();
    });

    it('should return null on JSON parse error', async () => {
      mockRedis.get.mockResolvedValue('invalid-json{');

      const result = await voiceCache.get('contact-invalid');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should cache voice preference with default TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const preference: VoicePreference = { enabled: true };

      await voiceCache.set('contact-123', preference);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'CACHE:voice:contact-123',
        1800, // Default 30 minutes
        JSON.stringify(preference)
      );
    });

    it('should cache voice preference with custom TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const preference: VoicePreference = { enabled: false };

      await voiceCache.set('contact-456', preference, 300);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'CACHE:voice:contact-456',
        300,
        JSON.stringify(preference)
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));
      const preference: VoicePreference = { enabled: true };

      // Should not throw
      await expect(voiceCache.set('contact-error', preference)).resolves.not.toThrow();
    });
  });

  describe('invalidate', () => {
    it('should delete cache key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await voiceCache.invalidate('contact-123');

      expect(mockRedis.del).toHaveBeenCalledWith('CACHE:voice:contact-123');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(voiceCache.invalidate('contact-error')).resolves.not.toThrow();
    });
  });
});

describe('getVoicePreferenceWithCache', () => {
  const mockRedis = redisClient.client as {
    get: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return cached value without calling loader', async () => {
    const cachedPref: VoicePreference = { enabled: true, voiceId: 'cached-voice' };
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedPref));
    const loader = vi.fn();

    const result = await getVoicePreferenceWithCache('contact-123', loader);

    expect(result).toEqual(cachedPref);
    expect(loader).not.toHaveBeenCalled();
  });

  it('should call loader and cache result on cache miss', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    const loadedPref: VoicePreference = { enabled: true, voiceId: 'loaded-voice' };
    const loader = vi.fn().mockResolvedValue(loadedPref);

    const result = await getVoicePreferenceWithCache('contact-456', loader);

    expect(result).toEqual(loadedPref);
    expect(loader).toHaveBeenCalled();
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'CACHE:voice:contact-456',
      1800,
      JSON.stringify(loadedPref)
    );
  });

  it('should not cache null loader result', async () => {
    mockRedis.get.mockResolvedValue(null);
    const loader = vi.fn().mockResolvedValue(null);

    const result = await getVoicePreferenceWithCache('contact-789', loader);

    expect(result).toBeNull();
    expect(loader).toHaveBeenCalled();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('should use custom TTL', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    const loadedPref: VoicePreference = { enabled: true };
    const loader = vi.fn().mockResolvedValue(loadedPref);

    await getVoicePreferenceWithCache('contact-custom', loader, 600);

    expect(mockRedis.setex).toHaveBeenCalledWith(
      'CACHE:voice:contact-custom',
      600,
      JSON.stringify(loadedPref)
    );
  });
});

describe('getDefaultVoicePreference', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return enabled=true by default', () => {
    delete process.env['VOICE_OUTPUT_ENABLED'];

    const result = getDefaultVoicePreference();

    expect(result.enabled).toBe(true);
  });

  it('should return enabled=false when env is "false"', () => {
    process.env['VOICE_OUTPUT_ENABLED'] = 'false';

    const result = getDefaultVoicePreference();

    expect(result.enabled).toBe(false);
  });

  it('should include voiceId when set in env', () => {
    process.env['ELEVENLABS_VOICE_ID'] = 'env-voice-id';

    const result = getDefaultVoicePreference();

    expect(result.voiceId).toBe('env-voice-id');
  });

  it('should include modelId when set in env', () => {
    process.env['ELEVENLABS_MODEL_ID'] = 'eleven_multilingual_v2';

    const result = getDefaultVoicePreference();

    expect(result.modelId).toBe('eleven_multilingual_v2');
  });

  it('should include maxCharacters when set in env', () => {
    process.env['TTS_MAX_CHARACTERS'] = '1000';

    const result = getDefaultVoicePreference();

    expect(result.maxCharacters).toBe(1000);
  });

  it('should not include optional fields when env vars not set', () => {
    delete process.env['ELEVENLABS_VOICE_ID'];
    delete process.env['ELEVENLABS_MODEL_ID'];
    delete process.env['TTS_MAX_CHARACTERS'];

    const result = getDefaultVoicePreference();

    expect(result.voiceId).toBeUndefined();
    expect(result.modelId).toBeUndefined();
    expect(result.maxCharacters).toBeUndefined();
  });
});
