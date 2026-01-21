/**
 * Entity to Memory Converter
 * Converts extracted entities to AutoMem memory format
 */

import { automemClient, type StoreMemoryResponse } from './client.js';
import type { ExtractedEntity } from '../ingestion/entity-extractor.js';

/**
 * Person memory structure
 */
interface PersonMemory {
  name: string;
  occupation?: string;
  company?: string;
  industry?: string;
  notes?: string;
}

/**
 * Topic memory structure
 */
interface TopicMemory {
  name: string;
  category?: string;
  mentionCount: number;
  lastMentioned: number;
}

/**
 * Event memory structure
 */
interface EventMemory {
  name: string;
  date?: string;
  location?: string;
  description?: string;
}

/**
 * Company memory structure
 */
interface CompanyMemory {
  name: string;
  industry?: string;
}

/**
 * Location memory structure
 */
interface LocationMemory {
  name: string;
  type?: string;
  address?: string;
}

/**
 * Generate tags for a person entity
 */
function generatePersonTags(contactId: string, personName: string): string[] {
  const normalizedName = personName.toLowerCase().replace(/\s+/g, '-');
  return [`contact:${contactId}`, 'entity:person', `person:${normalizedName}`];
}

/**
 * Generate tags for a topic entity
 */
function generateTopicTags(contactId: string, topicName: string, category?: string): string[] {
  const normalizedName = topicName.toLowerCase().replace(/\s+/g, '-');
  const tags = [`contact:${contactId}`, 'entity:topic', `topic:${normalizedName}`];
  if (category) {
    tags.push(`category:${category.toLowerCase()}`);
  }
  return tags;
}

/**
 * Generate tags for an event entity
 */
function generateEventTags(contactId: string, eventName: string, date?: string): string[] {
  const normalizedName = eventName.toLowerCase().replace(/\s+/g, '-');
  const tags = [`contact:${contactId}`, 'entity:event', `event:${normalizedName}`];
  if (date) {
    // Extract year-month for date-based filtering
    const dateMatch = date.match(/(\d{4})-(\d{2})/);
    if (dateMatch) {
      tags.push(`date:${dateMatch[1]}-${dateMatch[2]}`);
    }
  }
  return tags;
}

/**
 * Generate tags for a company entity
 */
function generateCompanyTags(companyName: string, industry?: string): string[] {
  const normalizedName = companyName.toLowerCase().replace(/\s+/g, '-');
  const tags = ['entity:company', `company:${normalizedName}`];
  if (industry) {
    tags.push(`industry:${industry.toLowerCase()}`);
  }
  return tags;
}

/**
 * Generate tags for a location entity
 */
function generateLocationTags(locationName: string, type?: string): string[] {
  const normalizedName = locationName.toLowerCase().replace(/\s+/g, '-');
  const tags = ['entity:location', `location:${normalizedName}`];
  if (type) {
    tags.push(`location-type:${type.toLowerCase()}`);
  }
  return tags;
}

/**
 * Store a person entity as a Context memory
 */
export async function storePerson(
  contactId: string,
  name: string,
  occupation?: string,
  company?: string,
  industry?: string
): Promise<StoreMemoryResponse> {
  const person: PersonMemory = { name };
  if (occupation) person.occupation = occupation;
  if (company) person.company = company;
  if (industry) person.industry = industry;

  const tags = generatePersonTags(contactId, name);

  console.log(`[Entity Store] Storing person: ${name} for contact ${contactId}`);

  return automemClient.store({
    content: JSON.stringify(person),
    type: 'Context',
    tags,
    importance: 0.7,
    metadata: {
      entityType: 'person',
      contactId,
      personName: name,
    },
  });
}

/**
 * Store a topic entity as a Context memory
 */
export async function storeTopic(
  contactId: string,
  name: string,
  category?: string
): Promise<StoreMemoryResponse> {
  const topic: TopicMemory = {
    name,
    mentionCount: 1,
    lastMentioned: Date.now(),
  };
  if (category) topic.category = category;

  const tags = generateTopicTags(contactId, name, category);

  console.log(`[Entity Store] Storing topic: ${name} for contact ${contactId}`);

  return automemClient.store({
    content: JSON.stringify(topic),
    type: 'Context',
    tags,
    importance: 0.6,
    metadata: {
      entityType: 'topic',
      contactId,
      topicName: name,
    },
  });
}

/**
 * Store an event entity as a Context memory
 */
export async function storeEvent(
  contactId: string,
  name: string,
  date?: string,
  location?: string,
  description?: string
): Promise<StoreMemoryResponse> {
  const event: EventMemory = { name };
  if (date) event.date = date;
  if (location) event.location = location;
  if (description) event.description = description;

  const tags = generateEventTags(contactId, name, date);

  console.log(`[Entity Store] Storing event: ${name} for contact ${contactId}`);

  return automemClient.store({
    content: JSON.stringify(event),
    type: 'Context',
    tags,
    importance: 0.65,
    metadata: {
      entityType: 'event',
      contactId,
      eventName: name,
    },
  });
}

/**
 * Store a company entity as a Context memory
 */
export async function storeCompany(
  name: string,
  industry?: string
): Promise<StoreMemoryResponse> {
  const company: CompanyMemory = { name };
  if (industry) company.industry = industry;

  const tags = generateCompanyTags(name, industry);

  console.log(`[Entity Store] Storing company: ${name}`);

  return automemClient.store({
    content: JSON.stringify(company),
    type: 'Context',
    tags,
    importance: 0.5,
    metadata: {
      entityType: 'company',
      companyName: name,
    },
  });
}

/**
 * Store a location entity as a Context memory
 */
export async function storeLocation(
  name: string,
  type?: string,
  address?: string
): Promise<StoreMemoryResponse> {
  const location: LocationMemory = { name };
  if (type) location.type = type;
  if (address) location.address = address;

  const tags = generateLocationTags(name, type);

  console.log(`[Entity Store] Storing location: ${name}`);

  return automemClient.store({
    content: JSON.stringify(location),
    type: 'Context',
    tags,
    importance: 0.4,
    metadata: {
      entityType: 'location',
      locationName: name,
    },
  });
}

/**
 * Result from storing entities
 */
export interface EntityStorageResult {
  stored: number;
  failed: number;
  errors: string[];
}

/**
 * Store extracted entities to AutoMem
 */
export async function storeEntities(
  contactId: string,
  entities: ExtractedEntity[]
): Promise<EntityStorageResult> {
  const result: EntityStorageResult = {
    stored: 0,
    failed: 0,
    errors: [],
  };

  for (const entity of entities) {
    try {
      switch (entity.type) {
        case 'PERSON': {
          const occupation = entity.properties['occupation'] as string | undefined;
          await storePerson(contactId, entity.name, occupation);
          result.stored++;
          break;
        }
        case 'COMPANY': {
          const industry = entity.properties['industry'] as string | undefined;
          await storeCompany(entity.name, industry);
          result.stored++;
          break;
        }
        case 'TOPIC': {
          const category = entity.properties['category'] as string | undefined;
          await storeTopic(contactId, entity.name, category);
          result.stored++;
          break;
        }
        case 'EVENT': {
          const date = entity.properties['date'] as string | undefined;
          const location = entity.properties['location'] as string | undefined;
          const description = entity.properties['description'] as string | undefined;
          await storeEvent(contactId, entity.name, date, location, description);
          result.stored++;
          break;
        }
        case 'LOCATION': {
          const locType = entity.properties['type'] as string | undefined;
          const address = entity.properties['address'] as string | undefined;
          await storeLocation(entity.name, locType, address);
          result.stored++;
          break;
        }
        default:
          console.warn(`[Entity Store] Unknown entity type: ${entity.type}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to store ${entity.type} "${entity.name}": ${message}`);
      result.failed++;
    }
  }

  return result;
}
