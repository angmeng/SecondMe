/**
 * Style Profile Skill Manifest
 */

import type { SkillManifest } from '@secondme/shared-types';

export const styleProfileManifest: SkillManifest = {
  id: 'style-profile',
  name: 'Style Profile',
  version: '1.0.0',
  description:
    'Retrieves the communication style profile learned from previous conversations with the contact.',
  author: 'SecondMe',
  configFields: [
    {
      key: 'enabled',
      type: 'boolean',
      label: 'Enable Style Matching',
      description: 'Whether to include style profile in context for response generation',
      default: true,
    },
    {
      key: 'minSampleMessages',
      type: 'number',
      label: 'Min Sample Messages',
      description: 'Minimum number of messages required before using style profile',
      default: 10,
    },
    {
      key: 'cacheTTL',
      type: 'number',
      label: 'Cache TTL (seconds)',
      description: 'How long to cache style profile data in Redis',
      default: 1800, // 30 minutes
    },
    {
      key: 'includeExamples',
      type: 'boolean',
      label: 'Include Style Examples',
      description: 'Include greeting and sign-off examples in the context',
      default: true,
    },
  ],
  permissions: ['redis:read', 'redis:write', 'automem:read'],
};
