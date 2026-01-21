/**
 * Style Profile to Memory Converter
 * Converts style profiles to AutoMem Preference memories
 */

import { automemClient, type StoreMemoryResponse } from './client.js';
import type { StyleProfile } from '../analysis/style-profile.js';

/**
 * Style profile memory structure for AutoMem
 */
interface StyleProfileMemory {
  avgMessageLength: number;
  emojiFrequency: number;
  formalityScore: number;
  punctuationStyle: {
    usesEllipsis: boolean;
    exclamationFrequency: number;
    questionFrequency: number;
    endsWithPeriod: boolean;
  };
  greetingStyle: string[];
  signOffStyle: string[];
  sampleCount: number;
  lastUpdated: number;
}

/**
 * Generate tags for a style profile
 */
function generateStyleProfileTags(contactId: string): string[] {
  return [`contact:${contactId}`, 'style:communication'];
}

/**
 * Store a style profile as a Preference memory
 */
export async function storeStyleProfile(
  contactId: string,
  profile: StyleProfile
): Promise<StoreMemoryResponse> {
  const memory: StyleProfileMemory = {
    avgMessageLength: profile.avgMessageLength,
    emojiFrequency: profile.emojiFrequency,
    formalityScore: profile.formalityScore,
    punctuationStyle: profile.punctuationStyle,
    greetingStyle: profile.greetingStyle,
    signOffStyle: profile.signOffStyle,
    sampleCount: profile.sampleCount,
    lastUpdated: profile.lastUpdated,
  };

  const tags = generateStyleProfileTags(contactId);

  console.log(
    `[Style Store] Storing style profile for ${contactId}: ` +
      `avgLen=${Math.round(memory.avgMessageLength)}, ` +
      `formality=${memory.formalityScore.toFixed(2)}, ` +
      `samples=${memory.sampleCount}`
  );

  return automemClient.store({
    content: JSON.stringify(memory),
    type: 'Preference',
    tags,
    importance: 0.75,
    metadata: {
      entityType: 'styleProfile',
      contactId,
      sampleCount: profile.sampleCount,
    },
  });
}

/**
 * Update style profile in AutoMem
 * AutoMem's consolidation handles merging with existing memory
 */
export async function updateStyleProfile(
  contactId: string,
  profile: StyleProfile
): Promise<StoreMemoryResponse> {
  // AutoMem consolidates memories with the same tags automatically
  return storeStyleProfile(contactId, profile);
}
