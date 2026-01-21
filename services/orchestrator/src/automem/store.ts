/**
 * AutoMem Store Helper Functions
 * Provides high-level functions for storing memories to AutoMem
 */

import { automemClient } from './client.js';
import {
  generatePersonTags,
  generateTopicTags,
  generateEventTags,
  generatePersonaTags,
  generateStyleProfileTags,
  generateContactTags,
} from './memory-types.js';
import type {
  StoreMemoryResponse,
  PersonMemory,
  TopicMemory,
  EventMemory,
  PersonaMemory,
  StyleProfileMemory,
  ContactMemory,
} from './memory-types.js';

// =============================================================================
// Entity Storage Functions
// =============================================================================

/**
 * Store a person entity as a Context memory
 */
export async function storePerson(
  contactId: string,
  person: PersonMemory,
  importance: number = 0.7
): Promise<StoreMemoryResponse> {
  const tags = generatePersonTags(contactId, person.name);
  const content = JSON.stringify(person);

  console.log(`[AutoMem Store] Storing person: ${person.name} for contact ${contactId}`);

  return automemClient.store({
    content,
    type: 'Context',
    tags,
    importance,
    metadata: {
      entityType: 'person',
      contactId,
      personName: person.name,
    },
  });
}

/**
 * Store a topic entity as a Context memory
 */
export async function storeTopic(
  contactId: string,
  topic: TopicMemory,
  importance: number = 0.6
): Promise<StoreMemoryResponse> {
  const tags = generateTopicTags(contactId, topic.name, topic.category);
  const content = JSON.stringify(topic);

  console.log(`[AutoMem Store] Storing topic: ${topic.name} for contact ${contactId}`);

  return automemClient.store({
    content,
    type: 'Context',
    tags,
    importance,
    metadata: {
      entityType: 'topic',
      contactId,
      topicName: topic.name,
      category: topic.category,
    },
  });
}

/**
 * Store an event entity as a Context memory
 */
export async function storeEvent(
  contactId: string,
  event: EventMemory,
  importance: number = 0.65
): Promise<StoreMemoryResponse> {
  const tags = generateEventTags(contactId, event.name, event.date);
  const content = JSON.stringify(event);

  console.log(`[AutoMem Store] Storing event: ${event.name} for contact ${contactId}`);

  return automemClient.store({
    content,
    type: 'Context',
    tags,
    importance,
    metadata: {
      entityType: 'event',
      contactId,
      eventName: event.name,
      eventDate: event.date,
    },
  });
}

/**
 * Store a persona as a Style memory
 */
export async function storePersona(
  persona: PersonaMemory,
  importance: number = 0.9
): Promise<StoreMemoryResponse> {
  const tags = generatePersonaTags(persona.id, persona.applicableTo);
  const content = JSON.stringify(persona);

  console.log(`[AutoMem Store] Storing persona: ${persona.name} (${persona.id})`);

  return automemClient.store({
    content,
    type: 'Style',
    tags,
    importance,
    metadata: {
      entityType: 'persona',
      personaId: persona.id,
      personaName: persona.name,
    },
  });
}

/**
 * Store a style profile as a Preference memory
 */
export async function storeStyleProfile(
  contactId: string,
  profile: StyleProfileMemory,
  importance: number = 0.75
): Promise<StoreMemoryResponse> {
  const tags = generateStyleProfileTags(contactId);
  const content = JSON.stringify(profile);

  console.log(
    `[AutoMem Store] Storing style profile for contact ${contactId}: ` +
      `avgLen=${Math.round(profile.avgMessageLength)}, formality=${profile.formalityScore.toFixed(2)}, ` +
      `samples=${profile.sampleCount}`
  );

  return automemClient.store({
    content,
    type: 'Preference',
    tags,
    importance,
    metadata: {
      entityType: 'styleProfile',
      contactId,
      sampleCount: profile.sampleCount,
    },
  });
}

/**
 * Store contact information as a Context memory
 */
export async function storeContact(
  contact: ContactMemory,
  importance: number = 0.8
): Promise<StoreMemoryResponse> {
  const tags = generateContactTags(contact.id, contact.relationshipType);
  const content = JSON.stringify(contact);

  console.log(`[AutoMem Store] Storing contact: ${contact.name} (${contact.id})`);

  return automemClient.store({
    content,
    type: 'Context',
    tags,
    importance,
    metadata: {
      entityType: 'contact',
      contactId: contact.id,
      contactName: contact.name,
      relationshipType: contact.relationshipType,
    },
  });
}

// =============================================================================
// Batch Storage Functions
// =============================================================================

/**
 * Store multiple persons in batch
 */
export async function batchStorePersons(
  contactId: string,
  persons: PersonMemory[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const person of persons) {
    try {
      await storePerson(contactId, person);
      success++;
    } catch (error) {
      console.error(`[AutoMem Store] Error storing person ${person.name}:`, error);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Store multiple topics in batch
 */
export async function batchStoreTopics(
  contactId: string,
  topics: TopicMemory[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const topic of topics) {
    try {
      await storeTopic(contactId, topic);
      success++;
    } catch (error) {
      console.error(`[AutoMem Store] Error storing topic ${topic.name}:`, error);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Store multiple events in batch
 */
export async function batchStoreEvents(
  contactId: string,
  events: EventMemory[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await storeEvent(contactId, event);
      success++;
    } catch (error) {
      console.error(`[AutoMem Store] Error storing event ${event.name}:`, error);
      failed++;
    }
  }

  return { success, failed };
}

// =============================================================================
// Update Functions (store with same tags to consolidate)
// =============================================================================

/**
 * Update contact's relationship type
 * AutoMem's consolidation will handle merging with existing memory
 */
export async function updateContactRelationshipType(
  contactId: string,
  relationshipType: string,
  relationshipConfidence: number,
  relationshipSource: 'auto_detected' | 'manual_override'
): Promise<StoreMemoryResponse> {
  // First, try to recall existing contact
  const existingResponse = await automemClient.recallContact(contactId);

  let contact: ContactMemory;
  const existingResult = existingResponse.results[0];
  if (existingResult) {
    // Update existing contact data
    const existingData = JSON.parse(existingResult.memory.content) as ContactMemory;
    contact = {
      ...existingData,
      relationshipType,
      relationshipConfidence,
      relationshipSource,
    };
  } else {
    // Create new contact with minimal data
    contact = {
      id: contactId,
      name: 'Unknown',
      relationshipType,
      botEnabled: false,
      relationshipConfidence,
      relationshipSource,
    };
  }

  console.log(
    `[AutoMem Store] Updated relationship for ${contactId}: ${relationshipType} ` +
      `(${Math.round(relationshipConfidence * 100)}%, source: ${relationshipSource})`
  );

  return storeContact(contact, 0.85);
}

/**
 * Update persona
 */
export async function updatePersona(
  personaId: string,
  updates: Partial<Omit<PersonaMemory, 'id'>>
): Promise<boolean> {
  try {
    // Recall existing persona
    const response = await automemClient.recallPersonaById(personaId);

    const existingResult = response.results[0];
    if (!existingResult) {
      console.log(`[AutoMem Store] Persona ${personaId} not found for update`);
      return false;
    }

    const existingData = JSON.parse(existingResult.memory.content) as PersonaMemory;

    // Merge updates
    const updatedPersona: PersonaMemory = {
      ...existingData,
      ...updates,
      id: personaId, // Ensure ID doesn't change
    };

    await storePersona(updatedPersona);
    return true;
  } catch (error) {
    console.error('[AutoMem Store] Error updating persona:', error);
    return false;
  }
}
