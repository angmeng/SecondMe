/**
 * Knowledge Graph Skill Manifest
 */

import type { SkillManifest } from '@secondme/shared-types';

export const knowledgeGraphManifest: SkillManifest = {
  id: 'knowledge-graph',
  name: 'Knowledge Graph',
  version: '1.0.0',
  description:
    'Retrieves relevant context from the knowledge graph including people, topics, and events related to the contact and message.',
  author: 'SecondMe',
  configFields: [
    {
      key: 'maxPeople',
      type: 'number',
      label: 'Max People',
      description: 'Maximum number of people to retrieve from the knowledge graph',
      default: 10,
    },
    {
      key: 'maxTopics',
      type: 'number',
      label: 'Max Topics',
      description: 'Maximum number of topics to retrieve',
      default: 8,
    },
    {
      key: 'maxEvents',
      type: 'number',
      label: 'Max Events',
      description: 'Maximum number of events to retrieve',
      default: 5,
    },
    {
      key: 'semanticEnabled',
      type: 'boolean',
      label: 'Enable Semantic Search',
      description: 'Use semantic vector search when available (falls back to keyword if unavailable)',
      default: true,
    },
    {
      key: 'fallbackThreshold',
      type: 'number',
      label: 'Fallback Threshold',
      description: 'Minimum results before triggering keyword fallback',
      default: 3,
    },
  ],
  permissions: ['redis:read', 'automem:read'],
};
