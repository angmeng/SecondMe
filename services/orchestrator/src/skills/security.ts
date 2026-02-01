/**
 * Skill Security Module
 * Provides restricted access to Redis based on skill permissions
 * Task 2.1.4: External Skill Loading
 */

import type { Redis } from 'ioredis';
import type { SkillManifest, SkillPermission } from '@secondme/shared-types';
import type { SkillLogger } from './types.js';

/**
 * Redis keys that are protected from external skill access
 * These are critical system keys that should not be modified by external code
 */
const PROTECTED_KEY_PREFIXES = [
  'PAUSE:',        // Pause/kill switch state
  'RATE:',         // Rate limiting
  'QUEUE:',        // Message queues
  'SKILLS:',       // Skill configuration (could escalate privileges)
  'AUTH:',         // Authentication
  'SESSION:',      // Session data
  'PAIRING:',      // Contact pairing data
  'HISTORY:',      // Conversation history (privacy)
  'LINKED:',       // Cross-channel contact linking
  'PERSONA:',      // Persona data
  'VOICE_PREF:',   // Voice preferences
];

/**
 * Key prefixes that external skills are allowed to READ
 * This is a whitelist approach for defense in depth
 */
const ALLOWED_READ_PREFIXES = [
  'CACHE:',        // General cache (safe to read)
  'EXT_SKILL:',    // External skill data
  'EMB:',          // Embeddings cache (read-only useful)
];

/**
 * Key prefixes that external skills can read/write
 * Skills should only access their own namespaced keys
 */
const SKILL_KEY_PREFIX = 'EXT_SKILL:';

/**
 * Create a restricted Redis client that filters operations based on permissions
 */
export function createRestrictedRedis(
  redis: Redis,
  manifest: SkillManifest,
  logger: SkillLogger
): RestrictedRedis {
  const permissions = new Set(manifest.permissions);
  const skillNamespace = `${SKILL_KEY_PREFIX}${manifest.id}:`;

  return new RestrictedRedis(redis, manifest.id, permissions, skillNamespace, logger);
}

/**
 * Restricted Redis client that enforces permission checks
 */
export class RestrictedRedis {
  constructor(
    private redis: Redis,
    private skillId: string,
    private permissions: Set<SkillPermission>,
    private namespace: string,
    private logger: SkillLogger
  ) {}

  /**
   * Check if a key is allowed for the given operation
   * Uses defense-in-depth: both blocklist (protected) and whitelist (allowed reads)
   */
  private isKeyAllowed(key: string, operation: 'read' | 'write'): boolean {
    // Check for protected keys (blocklist)
    for (const prefix of PROTECTED_KEY_PREFIXES) {
      if (key.startsWith(prefix)) {
        this.logger.warn(`Skill ${this.skillId} blocked from ${operation} on protected key: ${key}`);
        return false;
      }
    }

    // External skills can only write to their namespaced keys
    if (operation === 'write' && !key.startsWith(this.namespace)) {
      this.logger.warn(`Skill ${this.skillId} blocked from writing to non-namespaced key: ${key}`);
      return false;
    }

    // External skills can only read from whitelisted prefixes (defense in depth)
    if (operation === 'read') {
      const isAllowed = ALLOWED_READ_PREFIXES.some((prefix) => key.startsWith(prefix));
      if (!isAllowed) {
        this.logger.warn(`Skill ${this.skillId} blocked from reading non-whitelisted key: ${key}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Check read permission
   */
  private canRead(): boolean {
    return this.permissions.has('redis:read') || this.permissions.has('redis:write');
  }

  /**
   * Check write permission
   */
  private canWrite(): boolean {
    return this.permissions.has('redis:write');
  }

  /**
   * Get a value (requires redis:read permission)
   */
  async get(key: string): Promise<string | null> {
    if (!this.canRead()) {
      throw new Error(`Skill ${this.skillId} does not have redis:read permission`);
    }
    if (!this.isKeyAllowed(key, 'read')) {
      throw new Error(`Access denied to key: ${key}`);
    }
    return this.redis.get(key);
  }

  /**
   * Set a value (requires redis:write permission)
   * External skills can only write to their namespaced keys
   */
  async set(key: string, value: string): Promise<'OK'> {
    if (!this.canWrite()) {
      throw new Error(`Skill ${this.skillId} does not have redis:write permission`);
    }
    if (!this.isKeyAllowed(key, 'write')) {
      throw new Error(`Access denied to key: ${key}`);
    }
    return this.redis.set(key, value);
  }

  /**
   * Set with expiration (requires redis:write permission)
   */
  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    if (!this.canWrite()) {
      throw new Error(`Skill ${this.skillId} does not have redis:write permission`);
    }
    if (!this.isKeyAllowed(key, 'write')) {
      throw new Error(`Access denied to key: ${key}`);
    }
    return this.redis.setex(key, seconds, value);
  }

  /**
   * Delete a key (requires redis:write permission)
   */
  async del(...keys: string[]): Promise<number> {
    if (!this.canWrite()) {
      throw new Error(`Skill ${this.skillId} does not have redis:write permission`);
    }
    for (const key of keys) {
      if (!this.isKeyAllowed(key, 'write')) {
        throw new Error(`Access denied to key: ${key}`);
      }
    }
    return this.redis.del(...keys);
  }

  /**
   * Check if key exists (requires redis:read permission)
   */
  async exists(...keys: string[]): Promise<number> {
    if (!this.canRead()) {
      throw new Error(`Skill ${this.skillId} does not have redis:read permission`);
    }
    for (const key of keys) {
      if (!this.isKeyAllowed(key, 'read')) {
        throw new Error(`Access denied to key: ${key}`);
      }
    }
    return this.redis.exists(...keys);
  }

  /**
   * Get key TTL (requires redis:read permission)
   */
  async ttl(key: string): Promise<number> {
    if (!this.canRead()) {
      throw new Error(`Skill ${this.skillId} does not have redis:read permission`);
    }
    if (!this.isKeyAllowed(key, 'read')) {
      throw new Error(`Access denied to key: ${key}`);
    }
    return this.redis.ttl(key);
  }

  /**
   * Set expiration on a key (requires redis:write permission)
   */
  async expire(key: string, seconds: number): Promise<number> {
    if (!this.canWrite()) {
      throw new Error(`Skill ${this.skillId} does not have redis:write permission`);
    }
    if (!this.isKeyAllowed(key, 'write')) {
      throw new Error(`Access denied to key: ${key}`);
    }
    return this.redis.expire(key, seconds);
  }

  /**
   * Hash get (requires redis:read permission)
   */
  async hget(key: string, field: string): Promise<string | null> {
    if (!this.canRead()) {
      throw new Error(`Skill ${this.skillId} does not have redis:read permission`);
    }
    if (!this.isKeyAllowed(key, 'read')) {
      throw new Error(`Access denied to key: ${key}`);
    }
    return this.redis.hget(key, field);
  }

  /**
   * Hash set (requires redis:write permission)
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.canWrite()) {
      throw new Error(`Skill ${this.skillId} does not have redis:write permission`);
    }
    if (!this.isKeyAllowed(key, 'write')) {
      throw new Error(`Access denied to key: ${key}`);
    }
    return this.redis.hset(key, field, value);
  }

  /**
   * Hash get all (requires redis:read permission)
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.canRead()) {
      throw new Error(`Skill ${this.skillId} does not have redis:read permission`);
    }
    if (!this.isKeyAllowed(key, 'read')) {
      throw new Error(`Access denied to key: ${key}`);
    }
    return this.redis.hgetall(key);
  }

  /**
   * Get the skill's namespace prefix
   * Useful for skills to know what keys they can write to
   */
  getNamespace(): string {
    return this.namespace;
  }
}
