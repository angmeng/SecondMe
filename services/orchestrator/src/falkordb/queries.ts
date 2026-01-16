/**
 * FalkorDB Query Functions for Context Retrieval
 * User Story 2: Retrieves persona and knowledge graph context for response generation
 */

import { falkordbClient } from './client.js';

/**
 * Graph context retrieved for a contact
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
 * Persona retrieved from graph
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
 * Contact information from graph
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
 * Retrieve full context for a contact (2-hop traversal)
 * Gets people, topics, and events related to the contact
 */
export async function getContactContext(contactId: string): Promise<ContactContext> {
  console.log(`[FalkorDB Queries] Retrieving context for contact ${contactId}...`);

  const startTime = Date.now();

  // Run queries in parallel for better performance
  const [people, topics, events] = await Promise.all([
    getPeopleContext(contactId),
    getTopicsContext(contactId),
    getEventsContext(contactId),
  ]);

  const latency = Date.now() - startTime;
  console.log(`[FalkorDB Queries] Context retrieved in ${latency}ms: ${people.length} people, ${topics.length} topics, ${events.length} events`);

  return { people, topics, events };
}

/**
 * Get people and companies related to a contact
 */
async function getPeopleContext(contactId: string): Promise<PersonContext[]> {
  const query = `
    MATCH (c:Contact {id: $contactId})-[:KNOWS]->(p:Person)
    OPTIONAL MATCH (p)-[:WORKS_AT]->(comp:Company)
    RETURN p.name AS name, p.occupation AS occupation,
           comp.name AS company, comp.industry AS industry,
           p.notes AS notes, p.lastMentioned AS lastMentioned
    ORDER BY p.lastMentioned DESC
    LIMIT 10
  `;

  try {
    const results = await falkordbClient.query(query, { contactId });
    return results.map((row: any) => ({
      name: row.name,
      occupation: row.occupation || undefined,
      company: row.company || undefined,
      industry: row.industry || undefined,
      notes: row.notes || undefined,
      lastMentioned: row.lastMentioned || undefined,
    }));
  } catch (error) {
    console.error('[FalkorDB Queries] Error getting people context:', error);
    return [];
  }
}

/**
 * Get topics discussed with a contact
 */
async function getTopicsContext(contactId: string): Promise<TopicContext[]> {
  const query = `
    MATCH (c:Contact {id: $contactId})-[m:MENTIONED]->(t:Topic)
    RETURN t.name AS name, t.category AS category,
           m.times AS times, m.lastMentioned AS lastMentioned
    ORDER BY m.lastMentioned DESC
    LIMIT 8
  `;

  try {
    const results = await falkordbClient.query(query, { contactId });
    return results.map((row: any) => ({
      name: row.name,
      category: row.category || undefined,
      times: row.times || 1,
      lastMentioned: row.lastMentioned || Date.now(),
    }));
  } catch (error) {
    console.error('[FalkorDB Queries] Error getting topics context:', error);
    return [];
  }
}

/**
 * Get events related to a contact
 */
async function getEventsContext(contactId: string): Promise<EventContext[]> {
  const query = `
    MATCH (c:Contact {id: $contactId})-[:ATTENDING|:MENTIONED]->(e:Event)
    RETURN e.name AS name, e.date AS date,
           e.location AS location, e.description AS description
    ORDER BY e.date DESC
    LIMIT 5
  `;

  try {
    const results = await falkordbClient.query(query, { contactId });
    return results.map((row: any) => ({
      name: row.name,
      date: row.date || undefined,
      location: row.location || undefined,
      description: row.description || undefined,
    }));
  } catch (error) {
    console.error('[FalkorDB Queries] Error getting events context:', error);
    return [];
  }
}

/**
 * Get persona for a contact based on relationship type
 */
export async function getPersonaForContact(
  userId: string,
  relationshipType: string
): Promise<PersonaContext | null> {
  console.log(`[FalkorDB Queries] Getting persona for relationship type: ${relationshipType}`);

  const query = `
    MATCH (u:User {id: $userId})-[:HAS_PERSONA]->(p:Persona)
    WHERE $relationshipType IN p.applicableTo
    RETURN p.id AS id, p.name AS name, p.styleGuide AS styleGuide,
           p.tone AS tone, p.exampleMessages AS exampleMessages,
           p.applicableTo AS applicableTo
    LIMIT 1
  `;

  try {
    const results = await falkordbClient.query(query, { userId, relationshipType });

    if (results.length === 0) {
      console.log(`[FalkorDB Queries] No persona found for ${relationshipType}, trying default`);
      return getDefaultPersona(userId);
    }

    const row = results[0];
    return {
      id: row.id,
      name: row.name,
      styleGuide: row.styleGuide,
      tone: row.tone,
      exampleMessages: row.exampleMessages || [],
      applicableTo: row.applicableTo || [],
    };
  } catch (error) {
    console.error('[FalkorDB Queries] Error getting persona:', error);
    return null;
  }
}

/**
 * Get default persona for user
 */
export async function getDefaultPersona(userId: string): Promise<PersonaContext | null> {
  const query = `
    MATCH (u:User {id: $userId})
    MATCH (p:Persona {id: u.defaultPersona})
    RETURN p.id AS id, p.name AS name, p.styleGuide AS styleGuide,
           p.tone AS tone, p.exampleMessages AS exampleMessages,
           p.applicableTo AS applicableTo
    LIMIT 1
  `;

  try {
    const results = await falkordbClient.query(query, { userId });

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      id: row.id,
      name: row.name,
      styleGuide: row.styleGuide,
      tone: row.tone,
      exampleMessages: row.exampleMessages || [],
      applicableTo: row.applicableTo || [],
    };
  } catch (error) {
    console.error('[FalkorDB Queries] Error getting default persona:', error);
    return null;
  }
}

/**
 * Get contact information including relationship type
 */
export async function getContactInfo(contactId: string): Promise<ContactInfo | null> {
  const query = `
    MATCH (c:Contact {id: $contactId})
    RETURN c.id AS id, c.name AS name, c.phoneNumber AS phoneNumber,
           c.relationshipType AS relationshipType, c.botEnabled AS botEnabled,
           c.assignedPersona AS assignedPersona, c.lastInteraction AS lastInteraction
    LIMIT 1
  `;

  try {
    const results = await falkordbClient.query(query, { contactId });

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      id: row.id,
      name: row.name,
      phoneNumber: row.phoneNumber || undefined,
      relationshipType: row.relationshipType || 'acquaintance',
      botEnabled: row.botEnabled ?? false,
      assignedPersona: row.assignedPersona || undefined,
      lastInteraction: row.lastInteraction || undefined,
    };
  } catch (error) {
    console.error('[FalkorDB Queries] Error getting contact info:', error);
    return null;
  }
}

/**
 * Get all personas for a user (for persona editor)
 */
export async function getUserPersonas(userId: string): Promise<PersonaContext[]> {
  const query = `
    MATCH (u:User {id: $userId})-[:HAS_PERSONA]->(p:Persona)
    RETURN p.id AS id, p.name AS name, p.styleGuide AS styleGuide,
           p.tone AS tone, p.exampleMessages AS exampleMessages,
           p.applicableTo AS applicableTo
    ORDER BY p.name
  `;

  try {
    const results = await falkordbClient.query(query, { userId });
    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      styleGuide: row.styleGuide,
      tone: row.tone,
      exampleMessages: row.exampleMessages || [],
      applicableTo: row.applicableTo || [],
    }));
  } catch (error) {
    console.error('[FalkorDB Queries] Error getting user personas:', error);
    return [];
  }
}

/**
 * Update a persona
 */
export async function updatePersona(
  personaId: string,
  updates: Partial<Omit<PersonaContext, 'id'>>
): Promise<boolean> {
  const setClause: string[] = ['p.updatedAt = timestamp()'];
  const params: Record<string, any> = { personaId };

  if ('name' in updates && updates.name !== undefined) {
    setClause.push('p.name = $name');
    params['name'] = updates.name;
  }
  if ('styleGuide' in updates && updates.styleGuide !== undefined) {
    setClause.push('p.styleGuide = $styleGuide');
    params['styleGuide'] = updates.styleGuide;
  }
  if ('tone' in updates && updates.tone !== undefined) {
    setClause.push('p.tone = $tone');
    params['tone'] = updates.tone;
  }
  if ('exampleMessages' in updates && updates.exampleMessages !== undefined) {
    setClause.push('p.exampleMessages = $exampleMessages');
    params['exampleMessages'] = updates.exampleMessages;
  }
  if ('applicableTo' in updates && updates.applicableTo !== undefined) {
    setClause.push('p.applicableTo = $applicableTo');
    params['applicableTo'] = updates.applicableTo;
  }

  const query = `
    MATCH (p:Persona {id: $personaId})
    SET ${setClause.join(', ')}
    RETURN p.id
  `;

  try {
    const results = await falkordbClient.query(query, params);
    return results.length > 0;
  } catch (error) {
    console.error('[FalkorDB Queries] Error updating persona:', error);
    return false;
  }
}
