/**
 * Skill Manifest Validator
 * Validates skill manifests before loading
 * Task 2.1.4: External Skill Loading
 */

import type { SkillManifest, SkillPermission } from '@secondme/shared-types';
import { isSkillManifest } from '@secondme/shared-types';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Allowed skill permissions
 */
const VALID_PERMISSIONS: SkillPermission[] = [
  'redis:read',
  'redis:write',
  'automem:read',
  'automem:write',
  'network',
];

/**
 * Reserved skill IDs (cannot be used by external skills)
 */
const RESERVED_SKILL_IDS = new Set([
  'knowledge-graph',
  'persona',
  'style-profile',
  'conversation-history',
]);

/**
 * Validate a skill manifest
 */
export function validateSkillManifest(manifest: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Type guard check
  if (!isSkillManifest(manifest)) {
    errors.push('Manifest does not match SkillManifest interface');
    return { valid: false, errors, warnings };
  }

  // Validate required fields
  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('Missing or invalid manifest.id');
  } else {
    // Check for reserved IDs
    if (RESERVED_SKILL_IDS.has(manifest.id)) {
      errors.push(`Skill ID "${manifest.id}" is reserved for built-in skills`);
    }

    // Validate ID format (alphanumeric with hyphens)
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(manifest.id)) {
      errors.push('Skill ID must be lowercase alphanumeric with hyphens, not starting/ending with hyphen');
    }
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Missing or invalid manifest.name');
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('Missing or invalid manifest.version');
  } else if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    warnings.push('Version should follow semver format (e.g., 1.0.0)');
  }

  if (!manifest.description || typeof manifest.description !== 'string') {
    warnings.push('Missing manifest.description');
  }

  if (!manifest.author || typeof manifest.author !== 'string') {
    warnings.push('Missing manifest.author');
  }

  // Validate permissions
  if (!Array.isArray(manifest.permissions)) {
    errors.push('manifest.permissions must be an array');
  } else {
    for (const perm of manifest.permissions) {
      if (!VALID_PERMISSIONS.includes(perm as SkillPermission)) {
        errors.push(`Invalid permission: ${perm}. Valid permissions: ${VALID_PERMISSIONS.join(', ')}`);
      }
    }
  }

  // Validate configFields
  if (!Array.isArray(manifest.configFields)) {
    errors.push('manifest.configFields must be an array');
  } else {
    const seenKeys = new Set<string>();
    for (const field of manifest.configFields) {
      if (!field.key || typeof field.key !== 'string') {
        errors.push('Config field missing key');
        continue;
      }

      if (seenKeys.has(field.key)) {
        errors.push(`Duplicate config field key: ${field.key}`);
      }
      seenKeys.add(field.key);

      if (!field.type || !['string', 'number', 'boolean'].includes(field.type)) {
        errors.push(`Invalid config field type for ${field.key}: ${field.type}`);
      }

      if (!field.label || typeof field.label !== 'string') {
        warnings.push(`Config field ${field.key} missing label`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a skill has a specific permission
 */
export function hasPermission(manifest: SkillManifest, permission: SkillPermission): boolean {
  return manifest.permissions.includes(permission);
}

/**
 * Get all declared permissions for a skill
 */
export function getPermissions(manifest: SkillManifest): SkillPermission[] {
  return [...manifest.permissions];
}
