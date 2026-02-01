/**
 * Voice Cache - Redis-based caching for per-contact voice preferences
 * Task 4.1.2: Per-contact TTS preferences
 */

import { redisClient } from './client.js';
import { type VoicePreference, isVoicePreference } from '@secondme/shared-types';

const CACHE_PREFIX = 'CACHE:voice:';
const DEFAULT_TTL_SECONDS = 1800; // 30 minutes

/**
 * Voice cache class for managing cached voice preference data
 */
class VoiceCache {
  /**
   * Get cached voice preference by contact ID
   */
  async get(contactId: string): Promise<VoicePreference | null> {
    try {
      const cacheKey = this.buildKey(contactId);
      const cached = await redisClient.client.get(cacheKey);

      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (isVoicePreference(parsed)) {
          console.log(`[Voice Cache] Hit for ${contactId}`);
          return parsed;
        }
        // Invalid cache entry, delete it
        await this.invalidate(contactId);
      }

      console.log(`[Voice Cache] Miss for ${contactId}`);
      return null;
    } catch (error) {
      console.error('[Voice Cache] Error getting cached voice preference:', error);
      return null;
    }
  }

  /**
   * Set cached voice preference
   */
  async set(
    contactId: string,
    preference: VoicePreference,
    ttlSeconds: number = DEFAULT_TTL_SECONDS
  ): Promise<void> {
    try {
      const cacheKey = this.buildKey(contactId);
      await redisClient.client.setex(cacheKey, ttlSeconds, JSON.stringify(preference));
      console.log(`[Voice Cache] Cached ${contactId} for ${ttlSeconds}s`);
    } catch (error) {
      console.error('[Voice Cache] Error setting cached voice preference:', error);
    }
  }

  /**
   * Invalidate cached voice preference
   */
  async invalidate(contactId: string): Promise<void> {
    try {
      const cacheKey = this.buildKey(contactId);
      await redisClient.client.del(cacheKey);
      console.log(`[Voice Cache] Invalidated ${contactId}`);
    } catch (error) {
      console.error('[Voice Cache] Error invalidating cached voice preference:', error);
    }
  }

  /**
   * Build cache key
   */
  private buildKey(contactId: string): string {
    return `${CACHE_PREFIX}${contactId}`;
  }
}

// Export singleton instance
export const voiceCache = new VoiceCache();

/**
 * Get voice preference from cache or load from source
 * Helper function for common cache-first pattern
 */
export async function getVoicePreferenceWithCache(
  contactId: string,
  loader: () => Promise<VoicePreference | null>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<VoicePreference | null> {
  // Check cache first
  const cached = await voiceCache.get(contactId);
  if (cached) {
    return cached;
  }

  // Load from source
  const preference = await loader();

  // Cache if found
  if (preference) {
    await voiceCache.set(contactId, preference, ttlSeconds);
  }

  return preference;
}

/**
 * Default voice preference when none is set
 * Uses global settings from environment
 */
export function getDefaultVoicePreference(): VoicePreference {
  const preference: VoicePreference = {
    enabled: process.env['VOICE_OUTPUT_ENABLED'] !== 'false',
  };

  // Only add optional fields if they're defined (for exactOptionalPropertyTypes)
  const voiceId = process.env['ELEVENLABS_VOICE_ID'];
  if (voiceId) preference.voiceId = voiceId;

  const modelId = process.env['ELEVENLABS_MODEL_ID'];
  if (modelId) preference.modelId = modelId;

  const maxChars = process.env['TTS_MAX_CHARACTERS'];
  if (maxChars) preference.maxCharacters = parseInt(maxChars, 10);

  return preference;
}
