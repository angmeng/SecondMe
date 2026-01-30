/**
 * Skill Internal Types
 * Type definitions for skill implementation within the orchestrator
 */

import type { Redis } from 'ioredis';
import type {
  SkillManifest,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillHealthStatus,
} from '@secondme/shared-types';

/** Dependencies injected into skills */
export interface SkillDependencies {
  redis: Redis;
  logger: SkillLogger;
}

/** Simplified logger interface for skills */
export interface SkillLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/** Base Skill interface - all skills must implement this */
export interface Skill {
  /** Skill manifest with metadata */
  readonly manifest: SkillManifest;

  /** Initialize the skill (called once when registered) */
  activate(deps: SkillDependencies): Promise<void>;

  /** Cleanup resources (called when skill is unregistered) */
  deactivate(): Promise<void>;

  /** Execute the skill and return context */
  execute(context: SkillExecutionContext): Promise<SkillExecutionResult>;

  /** Health check */
  healthCheck(): Promise<SkillHealthStatus>;
}

/** Registered skill entry in the registry */
export interface RegisteredSkill {
  skill: Skill;
  enabled: boolean;
  health: SkillHealthStatus;
  lastHealthCheck: number;
  config: Record<string, unknown>;
}
