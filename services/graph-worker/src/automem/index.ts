/**
 * AutoMem Module for Graph Worker
 * Exports client and conversion utilities
 */

export { automemClient, type StoreMemoryResponse, type MemoryType } from './client.js';
export {
  storeEntities,
  storePerson,
  storeTopic,
  storeEvent,
  storeCompany,
  storeLocation,
  type EntityStorageResult,
} from './entity-to-memory.js';
export { storeStyleProfile, updateStyleProfile } from './style-to-memory.js';
export {
  recordProcessedMessage,
  updateContactLastInteraction,
  updateContactRelationshipType,
} from './contact-metadata.js';
