/**
 * FalkorDB Mutations - Write operations for knowledge graph
 * User Story 2: Handles graph updates from entity extraction
 */

import { falkordbClient } from './client.js';

/**
 * Create or update a message node (for tracking processed messages)
 */
export async function recordProcessedMessage(
  messageId: string,
  contactId: string,
  entitiesExtracted: number,
  timestamp: number
): Promise<void> {
  const query = `
    MERGE (m:ProcessedMessage {id: $messageId})
    ON CREATE SET
      m.contactId = $contactId,
      m.entitiesExtracted = $entitiesExtracted,
      m.processedAt = $timestamp,
      m.createdAt = timestamp()
    RETURN m.id
  `;

  await falkordbClient.query(query, {
    messageId,
    contactId,
    entitiesExtracted,
    timestamp,
  });
}

/**
 * Update contact's last interaction timestamp
 */
export async function updateContactLastInteraction(
  contactId: string,
  timestamp: number
): Promise<void> {
  const query = `
    MATCH (c:Contact {id: $contactId})
    SET c.lastInteraction = $timestamp, c.updatedAt = timestamp()
    RETURN c.id
  `;

  await falkordbClient.query(query, { contactId, timestamp });
}

/**
 * Create or update user node
 */
export async function ensureUserExists(
  userId: string,
  phoneNumber?: string,
  defaultPersona?: string
): Promise<void> {
  const query = `
    MERGE (u:User {id: $userId})
    ON CREATE SET
      u.phoneNumber = $phoneNumber,
      u.defaultPersona = $defaultPersona,
      u.sleepHoursStart = '23:00:00',
      u.sleepHoursEnd = '07:00:00',
      u.createdAt = timestamp()
    ON MATCH SET
      u.phoneNumber = COALESCE($phoneNumber, u.phoneNumber),
      u.defaultPersona = COALESCE($defaultPersona, u.defaultPersona),
      u.updatedAt = timestamp()
    RETURN u.id
  `;

  await falkordbClient.query(query, {
    userId,
    phoneNumber: phoneNumber || null,
    defaultPersona: defaultPersona || 'persona-professional',
  });
}

/**
 * Create or update contact node with full details
 */
export async function upsertContact(
  contactId: string,
  name: string,
  phoneNumber?: string,
  relationshipType?: string,
  botEnabled?: boolean,
  assignedPersona?: string
): Promise<void> {
  const query = `
    MERGE (c:Contact {id: $contactId})
    ON CREATE SET
      c.name = $name,
      c.phoneNumber = $phoneNumber,
      c.relationshipType = $relationshipType,
      c.botEnabled = $botEnabled,
      c.assignedPersona = $assignedPersona,
      c.createdAt = timestamp(),
      c.lastInteraction = timestamp()
    ON MATCH SET
      c.name = COALESCE($name, c.name),
      c.phoneNumber = COALESCE($phoneNumber, c.phoneNumber),
      c.relationshipType = COALESCE($relationshipType, c.relationshipType),
      c.botEnabled = COALESCE($botEnabled, c.botEnabled),
      c.assignedPersona = COALESCE($assignedPersona, c.assignedPersona),
      c.updatedAt = timestamp()
    RETURN c.id
  `;

  await falkordbClient.query(query, {
    contactId,
    name,
    phoneNumber: phoneNumber || null,
    relationshipType: relationshipType || 'acquaintance',
    botEnabled: botEnabled ?? false,
    assignedPersona: assignedPersona || null,
  });
}

/**
 * Link user to contact (HAS_CONTACT relationship)
 */
export async function linkUserToContact(userId: string, contactId: string): Promise<void> {
  const query = `
    MATCH (u:User {id: $userId})
    MATCH (c:Contact {id: $contactId})
    MERGE (u)-[:HAS_CONTACT]->(c)
    RETURN u.id, c.id
  `;

  await falkordbClient.query(query, { userId, contactId });
}

/**
 * Create or update persona
 */
export async function upsertPersona(
  personaId: string,
  name: string,
  styleGuide: string,
  tone: string,
  exampleMessages: string[],
  applicableTo: string[]
): Promise<void> {
  const query = `
    MERGE (p:Persona {id: $personaId})
    ON CREATE SET
      p.name = $name,
      p.styleGuide = $styleGuide,
      p.tone = $tone,
      p.exampleMessages = $exampleMessages,
      p.applicableTo = $applicableTo,
      p.createdAt = timestamp()
    ON MATCH SET
      p.name = $name,
      p.styleGuide = $styleGuide,
      p.tone = $tone,
      p.exampleMessages = $exampleMessages,
      p.applicableTo = $applicableTo,
      p.updatedAt = timestamp()
    RETURN p.id
  `;

  await falkordbClient.query(query, {
    personaId,
    name,
    styleGuide,
    tone,
    exampleMessages,
    applicableTo,
  });
}

/**
 * Link user to persona (HAS_PERSONA relationship)
 */
export async function linkUserToPersona(userId: string, personaId: string): Promise<void> {
  const query = `
    MATCH (u:User {id: $userId})
    MATCH (p:Persona {id: $personaId})
    MERGE (u)-[:HAS_PERSONA]->(p)
    RETURN u.id, p.id
  `;

  await falkordbClient.query(query, { userId, personaId });
}

/**
 * Batch create/update topics from a list
 */
export async function batchUpsertTopics(
  topics: Array<{ name: string; category?: string }>
): Promise<number> {
  let count = 0;

  for (const topic of topics) {
    try {
      await falkordbClient.createOrUpdateTopic(topic.name, topic.category);
      count++;
    } catch (error) {
      console.error(`[FalkorDB Mutations] Error upserting topic ${topic.name}:`, error);
    }
  }

  return count;
}

/**
 * Batch link contact to topics
 */
export async function batchLinkContactToTopics(
  contactId: string,
  topicNames: string[],
  timestamp: number
): Promise<number> {
  let count = 0;

  for (const topicName of topicNames) {
    try {
      await falkordbClient.linkContactToTopic(contactId, topicName, timestamp);
      count++;
    } catch (error) {
      console.error(`[FalkorDB Mutations] Error linking ${contactId} to topic ${topicName}:`, error);
    }
  }

  return count;
}

/**
 * Delete a contact and all associated relationships
 */
export async function deleteContact(contactId: string): Promise<void> {
  const query = `
    MATCH (c:Contact {id: $contactId})
    DETACH DELETE c
  `;

  await falkordbClient.query(query, { contactId });
}

/**
 * Update contact's bot enabled status
 */
export async function setContactBotEnabled(
  contactId: string,
  botEnabled: boolean
): Promise<void> {
  const query = `
    MATCH (c:Contact {id: $contactId})
    SET c.botEnabled = $botEnabled, c.updatedAt = timestamp()
    RETURN c.id
  `;

  await falkordbClient.query(query, { contactId, botEnabled });
}

/**
 * Update contact's assigned persona
 */
export async function setContactPersona(
  contactId: string,
  personaId: string
): Promise<void> {
  const query = `
    MATCH (c:Contact {id: $contactId})
    SET c.assignedPersona = $personaId, c.updatedAt = timestamp()
    RETURN c.id
  `;

  await falkordbClient.query(query, { contactId, personaId });
}

/**
 * Get graph statistics
 */
export async function getGraphStats(): Promise<{
  contacts: number;
  persons: number;
  companies: number;
  topics: number;
  events: number;
  relationships: number;
}> {
  const countQuery = `
    MATCH (c:Contact) WITH count(c) AS contacts
    MATCH (p:Person) WITH contacts, count(p) AS persons
    MATCH (comp:Company) WITH contacts, persons, count(comp) AS companies
    MATCH (t:Topic) WITH contacts, persons, companies, count(t) AS topics
    MATCH (e:Event) WITH contacts, persons, companies, topics, count(e) AS events
    MATCH ()-[r]->() WITH contacts, persons, companies, topics, events, count(r) AS relationships
    RETURN contacts, persons, companies, topics, events, relationships
  `;

  try {
    const results = await falkordbClient.query(countQuery, {});

    if (results.length > 0) {
      const row = results[0];
      return {
        contacts: row.contacts || 0,
        persons: row.persons || 0,
        companies: row.companies || 0,
        topics: row.topics || 0,
        events: row.events || 0,
        relationships: row.relationships || 0,
      };
    }
  } catch (error) {
    console.error('[FalkorDB Mutations] Error getting graph stats:', error);
  }

  return {
    contacts: 0,
    persons: 0,
    companies: 0,
    topics: 0,
    events: 0,
    relationships: 0,
  };
}


/**
 * Update contact's relationship type from auto-detection
 * Includes confidence score and source for audit trail
 */
export async function updateContactRelationshipType(
  contactId: string,
  relationshipType: string,
  relationshipConfidence: number,
  relationshipSource: 'auto_detected' | 'manual_override'
): Promise<void> {
  const query = `
    MATCH (c:Contact {id: $contactId})
    SET c.relationshipType = $relationshipType,
        c.relationshipConfidence = $relationshipConfidence,
        c.relationshipSource = $relationshipSource,
        c.relationshipUpdatedAt = timestamp(),
        c.updatedAt = timestamp()
    RETURN c.id
  `;

  await falkordbClient.query(query, {
    contactId,
    relationshipType,
    relationshipConfidence,
    relationshipSource,
  });

  console.log(
    `[FalkorDB Mutations] Updated relationship for ${contactId}: ${relationshipType} ` +
      `(${Math.round(relationshipConfidence * 100)}%, source: ${relationshipSource})`
  );
}

/**
 * Get contact relationship details including auto-detection info
 */
export async function getContactRelationshipDetails(
  contactId: string
): Promise<{
  relationshipType: string;
  relationshipConfidence: number | null;
  relationshipSource: string | null;
  relationshipUpdatedAt: number | null;
} | null> {
  const query = `
    MATCH (c:Contact {id: $contactId})
    RETURN c.relationshipType AS relationshipType,
           c.relationshipConfidence AS relationshipConfidence,
           c.relationshipSource AS relationshipSource,
           c.relationshipUpdatedAt AS relationshipUpdatedAt
  `;

  const results = await falkordbClient.query(query, { contactId });

  if (results.length > 0) {
    const row = results[0];
    return {
      relationshipType: row.relationshipType || 'acquaintance',
      relationshipConfidence: row.relationshipConfidence ?? null,
      relationshipSource: row.relationshipSource ?? null,
      relationshipUpdatedAt: row.relationshipUpdatedAt ?? null,
    };
  }

  return null;
}
