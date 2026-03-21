/**
 * Abstract Base Skill
 * Provides common functionality for skill implementations
 */

import type {
  SkillManifest,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillHealthStatus,
} from '@secondme/shared-types';
import type { Skill, SkillDependencies, SkillLogger } from './types.js';

/**
 * Abstract base class for skills
 * Provides common patterns and utilities for skill implementations
 */
export abstract class AbstractSkill implements Skill {
  abstract readonly manifest: SkillManifest;

  protected deps: SkillDependencies | null = null;
  protected logger: SkillLogger | null = null;
  protected activated = false;

  /**
   * Initialize the skill with dependencies
   * Override in subclasses for custom initialization
   */
  async activate(deps: SkillDependencies): Promise<void> {
    this.deps = deps;
    this.logger = deps.logger;
    this.activated = true;
    this.logger.info(`Skill ${this.manifest.id} activated`);
  }

  /**
   * Cleanup resources
   * Override in subclasses for custom cleanup
   */
  async deactivate(): Promise<void> {
    this.logger?.info(`Skill ${this.manifest.id} deactivated`);
    this.activated = false;
    this.deps = null;
    this.logger = null;
  }

  /**
   * Execute the skill - must be implemented by subclasses
   */
  abstract execute(context: SkillExecutionContext): Promise<SkillExecutionResult>;

  /**
   * Health check - default implementation returns healthy if activated
   * Override in subclasses for custom health checks
   */
  async healthCheck(): Promise<SkillHealthStatus> {
    return this.activated ? 'healthy' : 'unhealthy';
  }

  /**
   * Helper to get a config value with type safety and default fallback
   */
  protected getConfig<T>(
    context: SkillExecutionContext,
    key: string,
    defaultValue: T
  ): T {
    const value = context.config[key];
    if (value === undefined) {
      return defaultValue;
    }
    return value as T;
  }

  /**
   * Helper to build a result with timing metadata
   */
  protected buildResult(
    startTime: number,
    options: {
      context?: string;
      data?: Record<string, unknown>;
      cached?: boolean;
      itemCount?: number;
    }
  ): SkillExecutionResult {
    const result: SkillExecutionResult = {
      skillId: this.manifest.id,
      metadata: {
        latencyMs: Date.now() - startTime,
      },
    };

    // Only add optional properties if they have values (avoid undefined with exactOptionalPropertyTypes)
    if (options.context !== undefined) {
      result.context = options.context;
    }
    if (options.data !== undefined) {
      result.data = options.data;
    }
    if (options.cached !== undefined) {
      result.metadata!.cached = options.cached;
    }
    if (options.itemCount !== undefined) {
      result.metadata!.itemCount = options.itemCount;
    }

    return result;
  }

  /**
   * Ensure skill is activated before execution
   */
  protected ensureActivated(): void {
    if (!this.activated || !this.deps) {
      throw new Error(`Skill ${this.manifest.id} is not activated`);
    }
  }
}
