/**
 * AutoMem Module Index
 * Exports all AutoMem-related functionality
 */

// Client
export { automemClient } from './client.js';

// Types
export type {
  MemoryType,
  AutoMemMemory,
  StoreMemoryRequest,
  StoreMemoryResponse,
  RecallQuery,
  RecallResponse,
  RecallResult,
  ScoreComponents,
  HealthResponse,
  PersonMemory,
  TopicMemory,
  EventMemory,
  PersonaMemory,
  StyleProfileMemory,
  ContactMemory,
} from './memory-types.js';

// Tag generators
export {
  generatePersonTags,
  generateTopicTags,
  generateEventTags,
  generatePersonaTags,
  generateStyleProfileTags,
  generateContactTags,
} from './memory-types.js';

// Recall functions
export {
  getContactContext,
  getPersonaForContact,
  getDefaultPersona,
  getPersonaById,
  getContactInfo,
  getUserPersonas,
  getContactStyleProfile,
  searchRelevantContext,
} from './recall.js';

export type {
  ContactContext,
  PersonContext,
  TopicContext,
  EventContext,
  PersonaContext,
  ContactInfo,
  StyleProfile,
  PunctuationStyle,
} from './recall.js';

// Store functions
export {
  storePerson,
  storeTopic,
  storeEvent,
  storePersona,
  storeStyleProfile,
  storeContact,
  batchStorePersons,
  batchStoreTopics,
  batchStoreEvents,
  updateContactRelationshipType,
  updatePersona,
} from './store.js';
