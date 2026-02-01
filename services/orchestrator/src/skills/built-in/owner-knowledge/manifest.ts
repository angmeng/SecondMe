/**
 * Owner Knowledge Skill Manifest
 */

import type { SkillManifest } from '@secondme/shared-types';

export const ownerKnowledgeManifest: SkillManifest = {
  id: 'owner-knowledge',
  name: 'Owner Knowledge',
  version: '1.0.0',
  description:
    'Retrieves knowledge about the bot owner from uploaded documents to provide personal context when contacts ask questions.',
  author: 'SecondMe',
  configFields: [
    {
      key: 'maxChunks',
      type: 'number',
      label: 'Max Chunks',
      description: 'Maximum number of document chunks to retrieve',
      default: 3,
    },
    {
      key: 'minRelevanceScore',
      type: 'number',
      label: 'Min Relevance Score',
      description: 'Minimum relevance score (0-1) for chunks to be included',
      default: 0.5,
    },
    {
      key: 'includeFacts',
      type: 'boolean',
      label: 'Include Extracted Facts',
      description: 'Include extracted facts in the context',
      default: true,
    },
    {
      key: 'categoryPriority',
      type: 'select',
      label: 'Category Priority',
      description: 'Which document category to prioritize',
      options: ['all', 'professional', 'personal', 'knowledge', 'notes'],
      default: 'all',
    },
  ],
  permissions: ['automem:read'],
};
