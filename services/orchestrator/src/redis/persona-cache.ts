/**
 * Persona Cache - Redis-based caching for persona data
 * User Story 2: Reduces FalkorDB queries by caching persona style guides
 */

import { redisClient } from './client.js';
import { PersonaContext } from '../falkordb/queries.js';

const CACHE_PREFIX = 'CACHE:persona:';
const DEFAULT_TTL_SECONDS = 1800; // 30 minutes

/**
 * Persona cache class for managing cached persona data
 */
class PersonaCache {
  /**
   * Get cached persona by key
   */
  async get(key: string): Promise<PersonaContext | null> {
    try {
      const cacheKey = this.buildKey(key);
      const cached = await redisClient.client.get(cacheKey);

      if (cached) {
        console.log(`[Persona Cache] Hit for ${key}`);
        return JSON.parse(cached) as PersonaContext;
      }

      console.log(`[Persona Cache] Miss for ${key}`);
      return null;
    } catch (error) {
      console.error('[Persona Cache] Error getting cached persona:', error);
      return null;
    }
  }

  /**
   * Set cached persona
   */
  async set(key: string, persona: PersonaContext, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
    try {
      const cacheKey = this.buildKey(key);
      await redisClient.client.setex(cacheKey, ttlSeconds, JSON.stringify(persona));
      console.log(`[Persona Cache] Cached ${key} for ${ttlSeconds}s`);
    } catch (error) {
      console.error('[Persona Cache] Error setting cached persona:', error);
    }
  }

  /**
   * Invalidate cached persona
   */
  async invalidate(key: string): Promise<void> {
    try {
      const cacheKey = this.buildKey(key);
      await redisClient.client.del(cacheKey);
      console.log(`[Persona Cache] Invalidated ${key}`);
    } catch (error) {
      console.error('[Persona Cache] Error invalidating cached persona:', error);
    }
  }

  /**
   * Invalidate all personas for a user (when user edits personas)
   */
  async invalidateAll(): Promise<void> {
    try {
      const keys = await redisClient.client.keys(`${CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await redisClient.client.del(...keys);
        console.log(`[Persona Cache] Invalidated ${keys.length} cached personas`);
      }
    } catch (error) {
      console.error('[Persona Cache] Error invalidating all cached personas:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ count: number; keys: string[] }> {
    try {
      const keys = await redisClient.client.keys(`${CACHE_PREFIX}*`);
      return {
        count: keys.length,
        keys: keys.map((k: string) => k.replace(CACHE_PREFIX, '')),
      };
    } catch (error) {
      console.error('[Persona Cache] Error getting cache stats:', error);
      return { count: 0, keys: [] };
    }
  }

  /**
   * Build cache key
   */
  private buildKey(key: string): string {
    return `${CACHE_PREFIX}${key}`;
  }
}

// Export singleton instance
export const personaCache = new PersonaCache();

/**
 * Get persona from cache or load from FalkorDB
 * Helper function for common cache-first pattern
 */
export async function getPersonaWithCache(
  key: string,
  loader: () => Promise<PersonaContext | null>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<PersonaContext | null> {
  // Check cache first
  const cached = await personaCache.get(key);
  if (cached) {
    return cached;
  }

  // Load from source
  const persona = await loader();

  // Cache if found
  if (persona) {
    await personaCache.set(key, persona, ttlSeconds);
  }

  return persona;
}
