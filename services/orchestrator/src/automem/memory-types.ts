/**
 * AutoMem Memory Types and Interfaces
 * Maps SecondMe entities to AutoMem memory types
 */

/**
 * AutoMem memory types supported by the API
 */
export type MemoryType =
  | 'Context' // Person, Topic, Event entities
  | 'Style' // Persona definitions
  | 'Preference' // Style profiles, communication preferences
  | 'Pattern' // Response patterns
  | 'Insight' // Relationship insights
  | 'Decision' // User decisions
  | 'Habit'; // Behavioral patterns

/**
 * Base memory structure from AutoMem API
 */
export interface AutoMemMemory {
  id: string;
  content: string;
  type: MemoryType;
  confidence: number;
  tags: string[];
  importance: number;
  metadata: Record<string, unknown>;
  timestamp: string;
  updated_at: string;
  last_accessed: string;
}

/**
 * Request body for storing a memory
 */
export interface StoreMemoryRequest {
  content: string;
  type?: MemoryType;
  confidence?: number;
  tags?: string[];
  importance?: number;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  t_valid?: string;
  t_invalid?: string;
}

/**
 * Response from storing a memory
 */
export interface StoreMemoryResponse {
  status: 'success' | 'error';
  memory_id: string;
  stored_at: string;
  type: MemoryType;
  confidence: number;
  qdrant: string;
  embedding_status: string;
  enrichment: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  updated_at: string;
  last_accessed: string;
}

/**
 * Query parameters for recalling memories
 */
export interface RecallQuery {
  query?: string;
  tags?: string[];
  tag_mode?: 'any' | 'all';
  tag_match?: 'prefix' | 'exact';
  limit?: number;
  time_query?: string;
  start?: string;
  end?: string;
  context_types?: MemoryType[];
  context_tags?: string[];
  expand_relations?: boolean;
  expand_entities?: boolean;
}

/**
 * Score breakdown for a recalled memory
 */
export interface ScoreComponents {
  vector: number;
  tag: number;
  recency: number;
  exact: number;
}

/**
 * A single result from memory recall
 */
export interface RecallResult {
  id: string;
  match_type: 'vector' | 'keyword' | 'tag' | 'hybrid';
  final_score: number;
  score_components: ScoreComponents;
  memory: AutoMemMemory;
}

/**
 * Response from recalling memories
 */
export interface RecallResponse {
  status: 'success' | 'error';
  results: RecallResult[];
  time_window?: {
    start: string;
    end: string;
  };
  tags?: string[];
  count: number;
  context_priority?: {
    language?: string;
    context?: string;
    priority_tags?: string[];
    priority_types?: MemoryType[];
    injected: boolean;
  };
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  falkordb: 'connected' | 'disconnected';
  qdrant: 'connected' | 'disconnected';
}

// =============================================================================
// SecondMe Entity Mappings
// =============================================================================

/**
 * Person entity stored as Context memory
 * Tags: contact:{id}, entity:person, person:{name}
 */
export interface PersonMemory {
  name: string;
  occupation?: string;
  company?: string;
  industry?: string;
  notes?: string;
}

/**
 * Topic entity stored as Context memory
 * Tags: contact:{id}, entity:topic, topic:{name}
 */
export interface TopicMemory {
  name: string;
  category?: string;
  mentionCount: number;
  lastMentioned: number;
}

/**
 * Event entity stored as Context memory
 * Tags: contact:{id}, entity:event, date:{YYYY-MM}
 */
export interface EventMemory {
  name: string;
  date?: string;
  location?: string;
  description?: string;
}

/**
 * Persona stored as Style memory
 * Tags: persona:{id}, relationship:{type}
 */
export interface PersonaMemory {
  id: string;
  name: string;
  styleGuide: string;
  tone: string;
  exampleMessages: string[];
  applicableTo: string[];
}

/**
 * Style profile stored as Preference memory
 * Tags: contact:{id}, style:communication
 */
export interface StyleProfileMemory {
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
}

/**
 * Contact info stored as Context memory
 * Tags: contact:{id}, entity:contact
 */
export interface ContactMemory {
  id: string;
  name: string;
  phoneNumber?: string;
  relationshipType: string;
  botEnabled: boolean;
  assignedPersona?: string;
  relationshipConfidence?: number;
  relationshipSource?: 'auto_detected' | 'manual_override';
}

// =============================================================================
// Helper Functions for Tag Generation
// =============================================================================

/**
 * Generate tags for a person memory
 */
export function generatePersonTags(contactId: string, personName: string): string[] {
  return [
    `contact:${contactId}`,
    'entity:person',
    `person:${personName.toLowerCase().replace(/\s+/g, '-')}`,
  ];
}

/**
 * Generate tags for a topic memory
 */
export function generateTopicTags(contactId: string, topicName: string, category?: string): string[] {
  const tags = [
    `contact:${contactId}`,
    'entity:topic',
    `topic:${topicName.toLowerCase().replace(/\s+/g, '-')}`,
  ];
  if (category) {
    tags.push(`category:${category.toLowerCase()}`);
  }
  return tags;
}

/**
 * Generate tags for an event memory
 */
export function generateEventTags(contactId: string, eventName: string, date?: string): string[] {
  const tags = [
    `contact:${contactId}`,
    'entity:event',
    `event:${eventName.toLowerCase().replace(/\s+/g, '-')}`,
  ];
  if (date) {
    const yearMonth = date.substring(0, 7); // YYYY-MM
    tags.push(`date:${yearMonth}`);
  }
  return tags;
}

/**
 * Generate tags for a persona memory
 */
export function generatePersonaTags(personaId: string, applicableTo: string[]): string[] {
  const tags = [`persona:${personaId}`];
  for (const relType of applicableTo) {
    tags.push(`relationship:${relType.toLowerCase()}`);
  }
  return tags;
}

/**
 * Generate tags for a style profile memory
 */
export function generateStyleProfileTags(contactId: string): string[] {
  return [`contact:${contactId}`, 'style:communication'];
}

/**
 * Generate tags for a contact memory
 */
export function generateContactTags(contactId: string, relationshipType?: string): string[] {
  const tags = [`contact:${contactId}`, 'entity:contact'];
  if (relationshipType) {
    tags.push(`relationship:${relationshipType.toLowerCase()}`);
  }
  return tags;
}
