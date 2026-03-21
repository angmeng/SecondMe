/**
 * Skill Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { validateSkillManifest, hasPermission } from '../validator.js';
import type { SkillManifest } from '@secondme/shared-types';

describe('validateSkillManifest', () => {
  const validManifest: SkillManifest = {
    id: 'test-skill',
    name: 'Test Skill',
    version: '1.0.0',
    description: 'A test skill',
    author: 'Test Author',
    permissions: ['redis:read'],
    configFields: [
      {
        key: 'maxItems',
        type: 'number',
        label: 'Max Items',
        default: 10,
      },
    ],
  };

  it('should accept a valid manifest', () => {
    const result = validateSkillManifest(validManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject non-object values', () => {
    const result = validateSkillManifest('not an object');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Manifest does not match SkillManifest interface');
  });

  it('should reject null', () => {
    const result = validateSkillManifest(null);
    expect(result.valid).toBe(false);
  });

  it('should reject reserved skill IDs', () => {
    const manifest = { ...validManifest, id: 'knowledge-graph' };
    const result = validateSkillManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('reserved'))).toBe(true);
  });

  it('should reject invalid skill ID format', () => {
    const manifest = { ...validManifest, id: '-invalid' };
    const result = validateSkillManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('alphanumeric'))).toBe(true);
  });

  it('should accept valid skill ID formats', () => {
    const validIds = ['a', 'my-skill', 'skill-v2', 'abc123'];
    for (const id of validIds) {
      const manifest = { ...validManifest, id };
      const result = validateSkillManifest(manifest);
      expect(result.valid).toBe(true);
    }
  });

  it('should reject invalid permissions', () => {
    const manifest = {
      ...validManifest,
      permissions: ['invalid-permission' as never],
    };
    const result = validateSkillManifest(manifest);
    expect(result.valid).toBe(false);
    // Note: isSkillManifest type guard catches invalid permissions first
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should accept all valid permissions', () => {
    const manifest = {
      ...validManifest,
      permissions: ['redis:read', 'redis:write', 'automem:read', 'automem:write', 'network'],
    };
    const result = validateSkillManifest(manifest);
    expect(result.valid).toBe(true);
  });

  it('should warn about missing description', () => {
    const manifest = { ...validManifest, description: '' };
    const result = validateSkillManifest(manifest);
    // Should be valid but with warning
    expect(result.warnings.some((w) => w.includes('description'))).toBe(true);
  });

  it('should warn about non-semver version', () => {
    const manifest = { ...validManifest, version: 'v1' };
    const result = validateSkillManifest(manifest);
    expect(result.warnings.some((w) => w.includes('semver'))).toBe(true);
  });

  it('should reject duplicate config field keys', () => {
    const manifest = {
      ...validManifest,
      configFields: [
        { key: 'foo', type: 'string' as const, label: 'Foo', default: '' },
        { key: 'foo', type: 'number' as const, label: 'Foo 2', default: 0 },
      ],
    };
    const result = validateSkillManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate config field'))).toBe(true);
  });

  it('should reject invalid config field type', () => {
    const manifest = {
      ...validManifest,
      configFields: [
        { key: 'foo', type: 'object' as never, label: 'Foo', default: {} },
      ],
    };
    const result = validateSkillManifest(manifest);
    expect(result.valid).toBe(false);
    // Note: isSkillManifest type guard catches invalid config field types first
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('hasPermission', () => {
  const manifest: SkillManifest = {
    id: 'test',
    name: 'Test',
    version: '1.0.0',
    description: '',
    author: '',
    permissions: ['redis:read', 'automem:write'],
    configFields: [],
  };

  it('should return true for granted permissions', () => {
    expect(hasPermission(manifest, 'redis:read')).toBe(true);
    expect(hasPermission(manifest, 'automem:write')).toBe(true);
  });

  it('should return false for not granted permissions', () => {
    expect(hasPermission(manifest, 'redis:write')).toBe(false);
    expect(hasPermission(manifest, 'network')).toBe(false);
  });
});
