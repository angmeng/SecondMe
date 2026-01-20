/**
 * Style Cache - Redis-based caching for contact style profiles
 * Per-Contact Style Profiling: Reduces FalkorDB queries by caching style data
 */

import { redisClient } from './client.js';
import { StyleProfile } from '../falkordb/queries.js';

const CACHE_PREFIX = 'CACHE:style:';
const DEFAULT_TTL_SECONDS = 1800; // 30 minutes

/**
 * Style cache class for managing cached style profile data
 */
class StyleCache {
  /**
   * Get cached style profile by contact ID
   */
  async get(contactId: string): Promise<StyleProfile | null> {
    try {
      const cacheKey = this.buildKey(contactId);
      const cached = await redisClient.client.get(cacheKey);

      if (cached) {
        console.log(`[Style Cache] Hit for ${contactId}`);
        return JSON.parse(cached) as StyleProfile;
      }

      console.log(`[Style Cache] Miss for ${contactId}`);
      return null;
    } catch (error) {
      console.error('[Style Cache] Error getting cached style profile:', error);
      return null;
    }
  }

  /**
   * Set cached style profile
   */
  async set(
    contactId: string,
    profile: StyleProfile,
    ttlSeconds: number = DEFAULT_TTL_SECONDS
  ): Promise<void> {
    try {
      const cacheKey = this.buildKey(contactId);
      await redisClient.client.setex(cacheKey, ttlSeconds, JSON.stringify(profile));
      console.log(`[Style Cache] Cached ${contactId} for ${ttlSeconds}s`);
    } catch (error) {
      console.error('[Style Cache] Error setting cached style profile:', error);
    }
  }

  /**
   * Invalidate cached style profile
   */
  async invalidate(contactId: string): Promise<void> {
    try {
      const cacheKey = this.buildKey(contactId);
      await redisClient.client.del(cacheKey);
      console.log(`[Style Cache] Invalidated ${contactId}`);
    } catch (error) {
      console.error('[Style Cache] Error invalidating cached style profile:', error);
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
export const styleCache = new StyleCache();

/**
 * Get style profile from cache or load from FalkorDB
 * Helper function for common cache-first pattern
 */
export async function getStyleProfileWithCache(
  contactId: string,
  loader: () => Promise<StyleProfile | null>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<StyleProfile | null> {
  // Check cache first
  const cached = await styleCache.get(contactId);
  if (cached) {
    return cached;
  }

  // Load from source
  const profile = await loader();

  // Cache if found
  if (profile) {
    await styleCache.set(contactId, profile, ttlSeconds);
  }

  return profile;
}
