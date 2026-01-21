/**
 * AutoMem Recall Helper Functions
 * Provides high-level functions for retrieving context from AutoMem
 */

import { automemClient } from './client.js';
import type {
  RecallResponse,
  RecallResult,
  PersonMemory,
  TopicMemory,
  EventMemory,
  PersonaMemory,
  StyleProfileMemory,
  ContactMemory,
} from './memory-types.js';

/**
 * Contact context retrieved from AutoMem
 */
export interface ContactContext {
  people: PersonContext[];
  topics: TopicContext[];
  events: EventContext[];
}

export interface PersonContext {
  name: string;
  occupation?: string;
  company?: string;
  industry?: string;
  notes?: string;
  lastMentioned?: number;
}

export interface TopicContext {
  name: string;
  category?: string;
  times: number;
  lastMentioned: number;
}

export interface EventContext {
  name: string;
  date?: string;
  location?: string;
  description?: string;
}

/**
 * Persona context for response generation
 */
export interface PersonaContext {
  id: string;
  name: string;
  styleGuide: string;
  tone: string;
  exampleMessages: string[];
  applicableTo: string[];
}

/**
 * Contact information
 */
export interface ContactInfo {
  id: string;
  name: string;
  phoneNumber?: string;
  relationshipType: string;
  botEnabled: boolean;
  assignedPersona?: string;
  lastInteraction?: number;
}

/**
 * Punctuation style characteristics
 */
export interface PunctuationStyle {
  usesEllipsis: boolean;
  exclamationFrequency: number;
  questionFrequency: number;
  endsWithPeriod: boolean;
}

/**
 * Confidence level for style profile reliability
 * - low: 10-24 samples - basic metrics only (length, emoji, formality)
 * - medium: 25-39 samples - includes punctuation patterns
 * - high: 40+ samples - includes greeting/sign-off patterns (full profile)
 */
export type StyleConfidence = 'low' | 'medium' | 'high';

/**
 * Per-feature confidence tracking
 * Indicates which features have sufficient data for reliable inference
 */
export interface FeatureConfidence {
  basicMetrics: boolean; // length, emoji, formality (requires 10+ samples)
  punctuation: boolean; // ellipsis, exclamation, question patterns (requires 25+ samples)
  greetingsSignOffs: boolean; // greeting/sign-off patterns (requires 40+ samples)
}

/**
 * Per-contact communication style profile
 */
export interface StyleProfile {
  contactId: string;
  avgMessageLength: number;
  emojiFrequency: number;
  formalityScore: number;
  punctuationStyle: PunctuationStyle;
  greetingStyle: string[];
  signOffStyle: string[];
  sampleCount: number;
  lastUpdated: number;
  confidence: StyleConfidence;
  featureConfidence: FeatureConfidence;
}

// =============================================================================
// Helper Functions to Extract Data from AutoMem Responses
// =============================================================================

/**
 * Parse memory content as JSON with type safety
 */
function parseMemoryContent<T>(result: RecallResult): T | null {
  try {
    return JSON.parse(result.memory.content) as T;
  } catch {
    console.warn(`[AutoMem Recall] Failed to parse memory content: ${result.id}`);
    return null;
  }
}

/**
 * Extract person context from recall results
 */
function extractPeopleFromResults(results: RecallResult[]): PersonContext[] {
  const people: PersonContext[] = [];

  for (const result of results) {
    const data = parseMemoryContent<PersonMemory>(result);
    if (data) {
      const person: PersonContext = { name: data.name };
      if (data.occupation) person.occupation = data.occupation;
      if (data.company) person.company = data.company;
      if (data.industry) person.industry = data.industry;
      if (data.notes) person.notes = data.notes;
      if (result.memory.timestamp) {
        person.lastMentioned = new Date(result.memory.timestamp).getTime();
      }
      people.push(person);
    }
  }

  return people;
}

/**
 * Extract topic context from recall results
 */
function extractTopicsFromResults(results: RecallResult[]): TopicContext[] {
  const topics: TopicContext[] = [];

  for (const result of results) {
    const data = parseMemoryContent<TopicMemory>(result);
    if (data) {
      const topic: TopicContext = {
        name: data.name,
        times: data.mentionCount || 1,
        lastMentioned: data.lastMentioned || new Date(result.memory.timestamp).getTime(),
      };
      if (data.category) topic.category = data.category;
      topics.push(topic);
    }
  }

  return topics;
}

/**
 * Extract event context from recall results
 */
function extractEventsFromResults(results: RecallResult[]): EventContext[] {
  const events: EventContext[] = [];

  for (const result of results) {
    const data = parseMemoryContent<EventMemory>(result);
    if (data) {
      const event: EventContext = { name: data.name };
      if (data.date) event.date = data.date;
      if (data.location) event.location = data.location;
      if (data.description) event.description = data.description;
      events.push(event);
    }
  }

  return events;
}

// =============================================================================
// Main Recall Functions
// =============================================================================

/**
 * Retrieve full context for a contact (people, topics, events)
 */
export async function getContactContext(contactId: string): Promise<ContactContext> {
  console.log(`[AutoMem Recall] Retrieving context for contact ${contactId}...`);
  const startTime = Date.now();

  // Run queries in parallel for better performance
  const [peopleResponse, topicsResponse, eventsResponse] = await Promise.all([
    automemClient.recallPeople(contactId),
    automemClient.recallTopics(contactId),
    automemClient.recallEvents(contactId),
  ]);

  const people = extractPeopleFromResults(peopleResponse.results);
  const topics = extractTopicsFromResults(topicsResponse.results);
  const events = extractEventsFromResults(eventsResponse.results);

  const latency = Date.now() - startTime;
  console.log(
    `[AutoMem Recall] Context retrieved in ${latency}ms: ${people.length} people, ${topics.length} topics, ${events.length} events`
  );

  return { people, topics, events };
}

/**
 * Get persona for a contact based on relationship type
 */
export async function getPersonaForContact(
  userId: string,
  relationshipType: string
): Promise<PersonaContext | null> {
  console.log(`[AutoMem Recall] Getting persona for relationship type: ${relationshipType}`);

  try {
    const response = await automemClient.recallPersona(relationshipType);

    const firstResult = response.results[0];
    if (!firstResult) {
      console.log(`[AutoMem Recall] No persona found for ${relationshipType}, trying default`);
      return getDefaultPersona(userId);
    }

    const data = parseMemoryContent<PersonaMemory>(firstResult);
    if (!data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      styleGuide: data.styleGuide,
      tone: data.tone,
      exampleMessages: data.exampleMessages || [],
      applicableTo: data.applicableTo || [],
    };
  } catch (error) {
    console.error('[AutoMem Recall] Error getting persona:', error);
    return null;
  }
}

/**
 * Get default persona
 */
export async function getDefaultPersona(_userId: string): Promise<PersonaContext | null> {
  console.log(`[AutoMem Recall] Getting default persona`);

  try {
    // Try to get the professional persona as default
    const response = await automemClient.recallPersona('professional');

    let firstResult = response.results[0];
    if (!firstResult) {
      // Try any persona
      const anyResponse = await automemClient.recallAllPersonas();
      firstResult = anyResponse.results[0];
      if (!firstResult) {
        return null;
      }
    }

    const data = parseMemoryContent<PersonaMemory>(firstResult);
    if (!data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      styleGuide: data.styleGuide,
      tone: data.tone,
      exampleMessages: data.exampleMessages || [],
      applicableTo: data.applicableTo || [],
    };
  } catch (error) {
    console.error('[AutoMem Recall] Error getting default persona:', error);
    return null;
  }
}

/**
 * Get persona by ID
 */
export async function getPersonaById(personaId: string): Promise<PersonaContext | null> {
  console.log(`[AutoMem Recall] Getting persona by ID: ${personaId}`);

  try {
    const response = await automemClient.recallPersonaById(personaId);

    const firstResult = response.results[0];
    if (!firstResult) {
      console.log(`[AutoMem Recall] Persona ${personaId} not found`);
      return null;
    }

    const data = parseMemoryContent<PersonaMemory>(firstResult);
    if (!data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      styleGuide: data.styleGuide,
      tone: data.tone,
      exampleMessages: data.exampleMessages || [],
      applicableTo: data.applicableTo || [],
    };
  } catch (error) {
    console.error('[AutoMem Recall] Error getting persona by ID:', error);
    return null;
  }
}

/**
 * Get contact information
 */
export async function getContactInfo(contactId: string): Promise<ContactInfo | null> {
  try {
    const response = await automemClient.recallContact(contactId);

    const firstResult = response.results[0];
    if (!firstResult) {
      return null;
    }

    const data = parseMemoryContent<ContactMemory>(firstResult);
    if (!data) {
      return null;
    }

    const info: ContactInfo = {
      id: data.id,
      name: data.name,
      relationshipType: data.relationshipType || 'acquaintance',
      botEnabled: data.botEnabled ?? false,
    };
    if (data.phoneNumber) info.phoneNumber = data.phoneNumber;
    if (data.assignedPersona) info.assignedPersona = data.assignedPersona;
    if (firstResult.memory.timestamp) {
      info.lastInteraction = new Date(firstResult.memory.timestamp).getTime();
    }
    return info;
  } catch (error) {
    console.error('[AutoMem Recall] Error getting contact info:', error);
    return null;
  }
}

/**
 * Get all personas
 */
export async function getUserPersonas(_userId: string): Promise<PersonaContext[]> {
  try {
    const response = await automemClient.recallAllPersonas();

    return response.results
      .map((result) => {
        const data = parseMemoryContent<PersonaMemory>(result);
        if (!data) return null;

        return {
          id: data.id,
          name: data.name,
          styleGuide: data.styleGuide,
          tone: data.tone,
          exampleMessages: data.exampleMessages || [],
          applicableTo: data.applicableTo || [],
        };
      })
      .filter((p): p is PersonaContext => p !== null);
  } catch (error) {
    console.error('[AutoMem Recall] Error getting user personas:', error);
    return [];
  }
}

// Tiered thresholds for style profile confidence (must match graph-worker thresholds)
const STYLE_THRESHOLDS = {
  basicMetrics: 10, // length, emoji, formality
  punctuation: 25, // punctuation patterns
  greetingsSignOffs: 40, // greeting/sign-off patterns
};

/**
 * Calculate confidence level based on sample count
 */
function calculateStyleConfidence(sampleCount: number): StyleConfidence {
  if (sampleCount >= STYLE_THRESHOLDS.greetingsSignOffs) {
    return 'high';
  } else if (sampleCount >= STYLE_THRESHOLDS.punctuation) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Calculate feature confidence based on sample count
 */
function calculateFeatureConfidence(sampleCount: number): FeatureConfidence {
  return {
    basicMetrics: sampleCount >= STYLE_THRESHOLDS.basicMetrics,
    punctuation: sampleCount >= STYLE_THRESHOLDS.punctuation,
    greetingsSignOffs: sampleCount >= STYLE_THRESHOLDS.greetingsSignOffs,
  };
}

/**
 * Get contact's style profile
 */
export async function getContactStyleProfile(contactId: string): Promise<StyleProfile | null> {
  try {
    const response = await automemClient.recallStyleProfile(contactId);

    const firstResult = response.results[0];
    if (!firstResult) {
      return null;
    }

    const data = parseMemoryContent<StyleProfileMemory>(firstResult);
    if (!data) {
      return null;
    }

    const sampleCount = data.sampleCount || 0;

    // Check minimum sample count for basic profile
    if (sampleCount < STYLE_THRESHOLDS.basicMetrics) {
      return null;
    }

    // Calculate confidence levels
    const confidence = calculateStyleConfidence(sampleCount);
    const featureConfidence = calculateFeatureConfidence(sampleCount);

    return {
      contactId,
      avgMessageLength: data.avgMessageLength || 0,
      emojiFrequency: data.emojiFrequency || 0,
      formalityScore: data.formalityScore || 0.5,
      punctuationStyle: data.punctuationStyle || {
        usesEllipsis: false,
        exclamationFrequency: 0,
        questionFrequency: 0,
        endsWithPeriod: false,
      },
      greetingStyle: data.greetingStyle || [],
      signOffStyle: data.signOffStyle || [],
      sampleCount,
      lastUpdated: firstResult.memory.timestamp
        ? new Date(firstResult.memory.timestamp).getTime()
        : Date.now(),
      confidence,
      featureConfidence,
    };
  } catch (error) {
    console.error('[AutoMem Recall] Error getting style profile:', error);
    return null;
  }
}

/**
 * Semantic search for relevant context
 */
export async function searchRelevantContext(
  query: string,
  contactId: string,
  limit: number = 10
): Promise<RecallResponse> {
  return automemClient.semanticSearch(query, contactId, {
    limit,
    expand_relations: true,
  });
}
