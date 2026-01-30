/**
 * Skill System Types
 * Type definitions for the extensible skill/plugin system
 */

/** Permission scopes a skill can request */
export type SkillPermission = 'redis:read' | 'redis:write' | 'automem:read' | 'automem:write' | 'network';

/** Skill health status */
export type SkillHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/** Configuration field definition for skill settings */
export interface SkillConfigField {
  /** Config key identifier */
  key: string;
  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'select';
  /** Human-readable label */
  label: string;
  /** Description for the UI */
  description?: string;
  /** Default value */
  default: unknown;
  /** Options for 'select' type */
  options?: string[];
  /** Whether this field is required */
  required?: boolean;
}

/** Skill manifest - describes a skill's capabilities */
export interface SkillManifest {
  /** Unique skill identifier (e.g., 'knowledge-graph') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version */
  version: string;
  /** Description of what the skill does */
  description: string;
  /** Optional author name */
  author?: string;
  /** Configuration fields for the skill */
  configFields: SkillConfigField[];
  /** Required permissions */
  permissions: SkillPermission[];
}

/** Execution context passed to skills */
export interface SkillExecutionContext {
  /** Contact ID for the current conversation */
  contactId: string;
  /** The message being processed */
  messageContent: string;
  /** Relationship type (e.g., 'friend', 'colleague') */
  relationshipType: string;
  /** Skill-specific configuration values */
  config: Record<string, unknown>;
}

/** Result from skill execution */
export interface SkillExecutionResult {
  /** Unique skill ID that produced this result */
  skillId: string;
  /** Formatted context string to include in prompt */
  context?: string;
  /** Structured data for workflow state (optional) */
  data?: Record<string, unknown>;
  /** Execution metadata for logging */
  metadata?: {
    latencyMs: number;
    cached?: boolean;
    itemCount?: number;
  };
}

/** Skill info for frontend display */
export interface SkillInfo {
  /** Skill manifest */
  manifest: SkillManifest;
  /** Whether the skill is enabled */
  enabled: boolean;
  /** Current health status */
  health: SkillHealthStatus;
  /** Last health check timestamp */
  lastHealthCheck?: number;
  /** Current configuration values */
  config: Record<string, unknown>;
}

/** Default configuration for skills feature */
export interface SkillsConfig {
  /** Directory for external skills (future) */
  skillsDir?: string;
  /** Whether to load external skills (future) */
  loadExternalSkills: boolean;
}

/** Default skills configuration */
export const DEFAULT_SKILLS_CONFIG: SkillsConfig = {
  loadExternalSkills: false,
};
