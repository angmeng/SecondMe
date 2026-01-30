/**
 * Persona Skill Manifest
 */

import type { SkillManifest } from '@secondme/shared-types';

export const personaManifest: SkillManifest = {
  id: 'persona',
  name: 'Persona',
  version: '1.0.0',
  description:
    'Retrieves the appropriate persona style guide based on the contact relationship type or assigned persona.',
  author: 'SecondMe',
  configFields: [
    {
      key: 'cacheTTL',
      type: 'number',
      label: 'Cache TTL (seconds)',
      description: 'How long to cache persona data in Redis',
      default: 1800, // 30 minutes
    },
    {
      key: 'useRelationshipFallback',
      type: 'boolean',
      label: 'Use Relationship Fallback',
      description: 'Fall back to relationship-based persona if assigned persona not found',
      default: true,
    },
    {
      key: 'defaultTone',
      type: 'select',
      label: 'Default Tone',
      description: 'Fallback tone when no persona is found',
      default: 'casual',
      options: ['casual', 'professional', 'friendly', 'formal'],
    },
  ],
  permissions: ['redis:read', 'redis:write', 'automem:read'],
};
