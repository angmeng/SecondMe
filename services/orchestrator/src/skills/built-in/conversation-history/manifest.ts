/**
 * Conversation History Skill Manifest
 */

import type { SkillManifest } from '@secondme/shared-types';

export const conversationHistoryManifest: SkillManifest = {
  id: 'conversation-history',
  name: 'Conversation History',
  version: '1.0.0',
  description:
    'Retrieves recent conversation history with intelligent chunking to provide relevant context for response generation.',
  author: 'SecondMe',
  configFields: [
    {
      key: 'enabled',
      type: 'boolean',
      label: 'Enable History Context',
      description: 'Whether to include conversation history in the prompt',
      default: true,
    },
    {
      key: 'maxMessages',
      type: 'number',
      label: 'Max Messages',
      description: 'Maximum number of messages to retrieve from history',
      default: 50,
    },
    {
      key: 'tokenBudget',
      type: 'number',
      label: 'Token Budget',
      description: 'Approximate maximum tokens to use for history context',
      default: 2000,
    },
    {
      key: 'useKeywordChunking',
      type: 'boolean',
      label: 'Use Keyword Chunking',
      description: 'Use intelligent keyword-based chunking to select relevant messages',
      default: true,
    },
    {
      key: 'maxAgeHours',
      type: 'number',
      label: 'Max Age (hours)',
      description: 'Maximum age of messages to include (0 = no limit)',
      default: 168, // 1 week
    },
  ],
  permissions: ['redis:read'],
};
