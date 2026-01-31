/**
 * Skill Registry
 * Central registry for managing skills - registration, activation, configuration
 */

import type { Redis } from 'ioredis';
import type {
  SkillExecutionContext,
  SkillExecutionResult,
  SkillInfo,
  SkillHealthStatus,
} from '@secondme/shared-types';
import type { Skill, SkillDependencies, RegisteredSkill, SkillLogger } from './types.js';

// Redis keys for skill state persistence
const REDIS_KEYS = {
  ENABLED: 'SKILLS:enabled',
  CONFIG_PREFIX: 'SKILLS:config:',
};

// Default timeout for skill execution (ms)
const DEFAULT_SKILL_TIMEOUT_MS = 5000;

/**
 * Execute a promise with a timeout
 * Returns the result or throws a timeout error
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  skillId: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Skill ${skillId} execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Skill Registry - manages skill lifecycle and execution
 */
export class SkillRegistry {
  private skills: Map<string, RegisteredSkill> = new Map();
  private deps: SkillDependencies | null = null;
  private redis: Redis | null = null;
  private initialized = false;

  /**
   * Initialize the registry with dependencies
   * Must be called before registering skills
   */
  async initialize(redis: Redis, logger: SkillLogger): Promise<void> {
    this.redis = redis;
    this.deps = { redis, logger };
    this.initialized = true;
    logger.info('Skill registry initialized');
  }

  /**
   * Load persisted state from Redis
   * Call after initializing and registering all skills
   */
  async loadState(): Promise<void> {
    this.ensureInitialized();

    // Load enabled skills
    const enabledIds = await this.redis!.smembers(REDIS_KEYS.ENABLED);
    const enabledSet = new Set(enabledIds);

    // Load config for each skill and update enabled state
    for (const [skillId, entry] of this.skills.entries()) {
      // Update enabled state from Redis
      // If the set is empty (fresh install), treat all skills as enabled for backwards compat
      entry.enabled = enabledSet.size === 0 || enabledSet.has(skillId);

      // Load config from Redis
      const configKey = `${REDIS_KEYS.CONFIG_PREFIX}${skillId}`;
      const configJson = await this.redis!.get(configKey);

      if (configJson) {
        try {
          entry.config = JSON.parse(configJson);
        } catch {
          this.deps!.logger.warn(`Failed to parse config for skill ${skillId}`);
        }
      } else {
        // Initialize with defaults from manifest
        entry.config = this.getDefaultConfig(entry.skill);
      }
    }

    this.deps!.logger.info(`Loaded state for ${this.skills.size} skills`);
  }

  /**
   * Register a skill (calls activate)
   */
  async register(skill: Skill): Promise<void> {
    this.ensureInitialized();

    const skillId = skill.manifest.id;

    if (this.skills.has(skillId)) {
      throw new Error(`Skill ${skillId} is already registered`);
    }

    // Activate the skill
    await skill.activate(this.deps!);

    // Register with default state
    const entry: RegisteredSkill = {
      skill,
      enabled: true, // Enabled by default, will be updated from Redis
      health: 'healthy',
      lastHealthCheck: Date.now(),
      config: this.getDefaultConfig(skill),
    };

    this.skills.set(skillId, entry);
    this.deps!.logger.info(`Registered skill: ${skillId}`);
  }

  /**
   * Unregister a skill (calls deactivate)
   */
  async unregister(skillId: string): Promise<void> {
    const entry = this.skills.get(skillId);
    if (!entry) {
      throw new Error(`Skill ${skillId} is not registered`);
    }

    // Deactivate the skill
    await entry.skill.deactivate();

    // Remove from registry
    this.skills.delete(skillId);

    // Remove from Redis
    await this.redis!.srem(REDIS_KEYS.ENABLED, skillId);
    await this.redis!.del(`${REDIS_KEYS.CONFIG_PREFIX}${skillId}`);

    this.deps!.logger.info(`Unregistered skill: ${skillId}`);
  }

  /**
   * Enable a skill
   */
  async enable(skillId: string): Promise<void> {
    const entry = this.skills.get(skillId);
    if (!entry) {
      throw new Error(`Skill ${skillId} is not registered`);
    }

    entry.enabled = true;

    // Persist to Redis
    await this.redis!.sadd(REDIS_KEYS.ENABLED, skillId);

    this.deps!.logger.info(`Enabled skill: ${skillId}`);
  }

  /**
   * Disable a skill
   */
  async disable(skillId: string): Promise<void> {
    const entry = this.skills.get(skillId);
    if (!entry) {
      throw new Error(`Skill ${skillId} is not registered`);
    }

    entry.enabled = false;

    // Persist to Redis
    await this.redis!.srem(REDIS_KEYS.ENABLED, skillId);

    this.deps!.logger.info(`Disabled skill: ${skillId}`);
  }

  /**
   * Update skill configuration
   */
  async updateConfig(skillId: string, config: Record<string, unknown>): Promise<void> {
    const entry = this.skills.get(skillId);
    if (!entry) {
      throw new Error(`Skill ${skillId} is not registered`);
    }

    // Merge with existing config
    entry.config = { ...entry.config, ...config };

    // Persist to Redis
    const configKey = `${REDIS_KEYS.CONFIG_PREFIX}${skillId}`;
    await this.redis!.set(configKey, JSON.stringify(entry.config));

    this.deps!.logger.info(`Updated config for skill: ${skillId}`, { config });
  }

  /**
   * Get skill configuration
   */
  getConfig(skillId: string): Record<string, unknown> | null {
    const entry = this.skills.get(skillId);
    return entry?.config ?? null;
  }

  /**
   * Execute all enabled skills and collect results
   */
  async executeAll(
    context: Omit<SkillExecutionContext, 'config'>
  ): Promise<SkillExecutionResult[]> {
    const results: SkillExecutionResult[] = [];
    const enabledSkills: RegisteredSkill[] = [];

    // Collect enabled skills
    for (const entry of this.skills.values()) {
      if (entry.enabled && entry.health !== 'unhealthy') {
        enabledSkills.push(entry);
      }
    }

    if (enabledSkills.length === 0) {
      this.deps?.logger.warn('No enabled skills to execute');
      return results;
    }

    // Execute all skills in parallel with timeout protection
    const execPromises = enabledSkills.map(async (entry) => {
      const fullContext: SkillExecutionContext = {
        ...context,
        config: entry.config,
      };

      const skillId = entry.skill.manifest.id;
      const startTime = Date.now();

      try {
        // Execute with timeout protection
        const result = await withTimeout(
          entry.skill.execute(fullContext),
          DEFAULT_SKILL_TIMEOUT_MS,
          skillId
        );
        return result;
      } catch (error) {
        const isTimeout = error instanceof Error && error.message.includes('timed out');

        this.deps!.logger.error(`Skill ${skillId} execution failed`, {
          error: error instanceof Error ? error.message : String(error),
          isTimeout,
        });

        // Mark as degraded on error (unhealthy if timeout - more severe)
        entry.health = isTimeout ? 'unhealthy' : 'degraded';

        // Return empty result on error
        return {
          skillId,
          metadata: { latencyMs: Date.now() - startTime },
        };
      }
    });

    const settledResults = await Promise.all(execPromises);
    return settledResults.filter((r) => r.context || r.data);
  }

  /**
   * Get skill info for frontend display
   */
  listSkills(): SkillInfo[] {
    const infos: SkillInfo[] = [];

    for (const entry of this.skills.values()) {
      infos.push({
        manifest: entry.skill.manifest,
        enabled: entry.enabled,
        health: entry.health,
        lastHealthCheck: entry.lastHealthCheck,
        config: entry.config,
      });
    }

    return infos;
  }

  /**
   * Get a specific skill info
   */
  getSkill(skillId: string): SkillInfo | null {
    const entry = this.skills.get(skillId);
    if (!entry) {
      return null;
    }

    return {
      manifest: entry.skill.manifest,
      enabled: entry.enabled,
      health: entry.health,
      lastHealthCheck: entry.lastHealthCheck,
      config: entry.config,
    };
  }

  /**
   * Health check all skills
   */
  async healthCheckAll(): Promise<Map<string, SkillHealthStatus>> {
    const results = new Map<string, SkillHealthStatus>();

    for (const [skillId, entry] of this.skills.entries()) {
      try {
        const health = await entry.skill.healthCheck();
        entry.health = health;
        entry.lastHealthCheck = Date.now();
        results.set(skillId, health);
      } catch (error) {
        this.deps!.logger.error(`Health check failed for skill ${skillId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        entry.health = 'unhealthy';
        entry.lastHealthCheck = Date.now();
        results.set(skillId, 'unhealthy');
      }
    }

    return results;
  }

  /**
   * Get default config from skill manifest
   */
  private getDefaultConfig(skill: Skill): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    for (const field of skill.manifest.configFields) {
      config[field.key] = field.default;
    }
    return config;
  }

  /**
   * Ensure registry is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.deps || !this.redis) {
      throw new Error('Skill registry is not initialized');
    }
  }
}

// Export singleton instance
export const skillRegistry = new SkillRegistry();
