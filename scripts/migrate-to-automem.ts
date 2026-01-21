#!/usr/bin/env npx tsx
/**
 * Migration Script: FalkorDB to AutoMem
 * Reads all entities from the old FalkorDB and stores them in AutoMem
 *
 * Usage:
 *   npx tsx scripts/migrate-to-automem.ts [--dry-run]
 *
 * Environment variables required:
 *   FALKORDB_HOST, FALKORDB_PORT, FALKORDB_PASSWORD (old FalkorDB)
 *   AUTOMEM_API_URL, AUTOMEM_API_TOKEN (AutoMem)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { Redis } from 'ioredis';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

// Configuration
const FALKORDB_HOST = process.env['FALKORDB_HOST'] || 'localhost';
const FALKORDB_PORT = parseInt(process.env['FALKORDB_PORT'] || '6379', 10);
const FALKORDB_PASSWORD = process.env['FALKORDB_PASSWORD'];
const GRAPH_NAME = 'knowledge_graph';

const AUTOMEM_API_URL = process.env['AUTOMEM_API_URL'] || 'http://localhost:8001';
const AUTOMEM_API_TOKEN = process.env['AUTOMEM_API_TOKEN'];

const DRY_RUN = process.argv.includes('--dry-run');

// Stats tracking
const stats = {
  contacts: { total: 0, migrated: 0, failed: 0 },
  persons: { total: 0, migrated: 0, failed: 0 },
  topics: { total: 0, migrated: 0, failed: 0 },
  events: { total: 0, migrated: 0, failed: 0 },
  personas: { total: 0, migrated: 0, failed: 0 },
  styleProfiles: { total: 0, migrated: 0, failed: 0 },
};

// FalkorDB Client
let falkorClient: Redis;

async function initFalkorDB(): Promise<void> {
  falkorClient = new Redis({
    host: FALKORDB_HOST,
    port: FALKORDB_PORT,
    ...(FALKORDB_PASSWORD && { password: FALKORDB_PASSWORD }),
    maxRetriesPerRequest: 3,
  });

  await falkorClient.ping();
  console.log(`[Migration] Connected to FalkorDB at ${FALKORDB_HOST}:${FALKORDB_PORT}`);
}

async function closeFalkorDB(): Promise<void> {
  await falkorClient.quit();
}

async function queryFalkorDB(cypherQuery: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
  const cypherPrefix = Object.entries(params)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ');

  const fullQuery = cypherPrefix ? `CYPHER ${cypherPrefix} ${cypherQuery}` : cypherQuery;
  const result = await falkorClient.call('GRAPH.QUERY', GRAPH_NAME, fullQuery);

  return parseGraphResult(result);
}

function parseGraphResult(result: unknown): unknown[] {
  if (!result || !Array.isArray(result) || result.length === 0) {
    return [];
  }

  const [header, data] = result;
  if (!data || !Array.isArray(data) || data.length === 0) {
    return [];
  }

  return data.map((row: unknown[]) => {
    const obj: Record<string, unknown> = {};
    (header as string[]).forEach((colName: string, index: number) => {
      obj[colName] = row[index];
    });
    return obj;
  });
}

// AutoMem API helpers
async function storeToAutoMem(memory: {
  content: string;
  type: string;
  tags: string[];
  importance: number;
  metadata: Record<string, unknown>;
}): Promise<{ success: boolean; memory_id?: string; error?: string }> {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would store: ${memory.type} with tags: ${memory.tags.join(', ')}`);
    return { success: true, memory_id: 'dry-run-id' };
  }

  try {
    const response = await fetch(`${AUTOMEM_API_URL}/memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AUTOMEM_API_TOKEN && { Authorization: `Bearer ${AUTOMEM_API_TOKEN}` }),
      },
      body: JSON.stringify(memory),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    const data = await response.json() as { memory_id: string };
    return { success: true, memory_id: data.memory_id };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Migration functions
async function migrateContacts(): Promise<void> {
  console.log('\n[Migration] Migrating Contacts...');

  const query = `
    MATCH (c:Contact)
    RETURN c.id AS id, c.name AS name, c.phoneNumber AS phoneNumber,
           c.relationshipType AS relationshipType, c.botEnabled AS botEnabled,
           c.assignedPersona AS assignedPersona,
           c.relationshipConfidence AS relationshipConfidence,
           c.relationshipSource AS relationshipSource,
           c.styleAvgLength AS styleAvgLength, c.styleEmojiFreq AS styleEmojiFreq,
           c.styleFormalityScore AS styleFormalityScore,
           c.stylePunctuationData AS stylePunctuationData,
           c.styleGreetings AS styleGreetings, c.styleSignOffs AS styleSignOffs,
           c.styleSampleCount AS styleSampleCount
  `;

  const contacts = await queryFalkorDB(query) as Record<string, unknown>[];
  stats.contacts.total = contacts.length;
  console.log(`  Found ${contacts.length} contacts`);

  for (const contact of contacts) {
    const contactId = contact['id'] as string;
    const contactData = {
      id: contactId,
      name: contact['name'] as string || 'Unknown',
      phoneNumber: contact['phoneNumber'] as string | undefined,
      relationshipType: contact['relationshipType'] as string || 'acquaintance',
      botEnabled: contact['botEnabled'] as boolean ?? false,
      assignedPersona: contact['assignedPersona'] as string | undefined,
      relationshipConfidence: contact['relationshipConfidence'] as number | undefined,
      relationshipSource: contact['relationshipSource'] as string | undefined,
    };

    // Store contact as Context memory
    const tags = [`contact:${contactId}`, 'entity:contact'];
    if (contactData.relationshipType) {
      tags.push(`relationship:${contactData.relationshipType.toLowerCase()}`);
    }

    const result = await storeToAutoMem({
      content: JSON.stringify(contactData),
      type: 'Context',
      tags,
      importance: 0.8,
      metadata: { entityType: 'contact', contactId, migrated: true },
    });

    if (result.success) {
      stats.contacts.migrated++;
      console.log(`  ✓ Contact: ${contactData.name} (${contactId})`);
    } else {
      stats.contacts.failed++;
      console.error(`  ✗ Contact: ${contactData.name} - ${result.error}`);
    }

    // Also migrate style profile if present
    if (contact['styleSampleCount'] && (contact['styleSampleCount'] as number) >= 10) {
      stats.styleProfiles.total++;

      let punctuationStyle = {
        usesEllipsis: false,
        exclamationFrequency: 0,
        questionFrequency: 0,
        endsWithPeriod: false,
      };
      let greetingStyle: string[] = [];
      let signOffStyle: string[] = [];

      try {
        if (contact['stylePunctuationData']) {
          punctuationStyle = JSON.parse(contact['stylePunctuationData'] as string);
        }
        if (contact['styleGreetings']) {
          greetingStyle = JSON.parse(contact['styleGreetings'] as string);
        }
        if (contact['styleSignOffs']) {
          signOffStyle = JSON.parse(contact['styleSignOffs'] as string);
        }
      } catch {
        // Ignore parse errors
      }

      const styleProfile = {
        avgMessageLength: contact['styleAvgLength'] as number || 0,
        emojiFrequency: contact['styleEmojiFreq'] as number || 0,
        formalityScore: contact['styleFormalityScore'] as number || 0.5,
        punctuationStyle,
        greetingStyle,
        signOffStyle,
        sampleCount: contact['styleSampleCount'] as number,
      };

      const styleResult = await storeToAutoMem({
        content: JSON.stringify(styleProfile),
        type: 'Preference',
        tags: [`contact:${contactId}`, 'style:communication'],
        importance: 0.75,
        metadata: { entityType: 'styleProfile', contactId, migrated: true },
      });

      if (styleResult.success) {
        stats.styleProfiles.migrated++;
        console.log(`    ✓ Style profile for ${contactId}`);
      } else {
        stats.styleProfiles.failed++;
        console.error(`    ✗ Style profile for ${contactId} - ${styleResult.error}`);
      }
    }
  }
}

async function migratePersonsAndRelationships(): Promise<void> {
  console.log('\n[Migration] Migrating Persons...');

  const query = `
    MATCH (c:Contact)-[:KNOWS]->(p:Person)
    OPTIONAL MATCH (p)-[:WORKS_AT]->(comp:Company)
    RETURN c.id AS contactId, p.name AS name, p.occupation AS occupation,
           comp.name AS company, comp.industry AS industry, p.notes AS notes
  `;

  const persons = await queryFalkorDB(query) as Record<string, unknown>[];
  stats.persons.total = persons.length;
  console.log(`  Found ${persons.length} person relationships`);

  for (const person of persons) {
    const contactId = person['contactId'] as string;
    const personName = person['name'] as string;

    const personData = {
      name: personName,
      occupation: person['occupation'] as string | undefined,
      company: person['company'] as string | undefined,
      industry: person['industry'] as string | undefined,
      notes: person['notes'] as string | undefined,
    };

    const tags = [
      `contact:${contactId}`,
      'entity:person',
      `person:${personName.toLowerCase().replace(/\s+/g, '-')}`,
    ];

    const result = await storeToAutoMem({
      content: JSON.stringify(personData),
      type: 'Context',
      tags,
      importance: 0.7,
      metadata: { entityType: 'person', contactId, personName, migrated: true },
    });

    if (result.success) {
      stats.persons.migrated++;
      console.log(`  ✓ Person: ${personName} (contact: ${contactId})`);
    } else {
      stats.persons.failed++;
      console.error(`  ✗ Person: ${personName} - ${result.error}`);
    }
  }
}

async function migrateTopics(): Promise<void> {
  console.log('\n[Migration] Migrating Topics...');

  const query = `
    MATCH (c:Contact)-[m:MENTIONED]->(t:Topic)
    RETURN c.id AS contactId, t.name AS name, t.category AS category,
           m.times AS mentionCount, m.lastMentioned AS lastMentioned
  `;

  const topics = await queryFalkorDB(query) as Record<string, unknown>[];
  stats.topics.total = topics.length;
  console.log(`  Found ${topics.length} topic relationships`);

  for (const topic of topics) {
    const contactId = topic['contactId'] as string;
    const topicName = topic['name'] as string;

    const topicData = {
      name: topicName,
      category: topic['category'] as string | undefined,
      mentionCount: topic['mentionCount'] as number || 1,
      lastMentioned: topic['lastMentioned'] as number || Date.now(),
    };

    const tags = [
      `contact:${contactId}`,
      'entity:topic',
      `topic:${topicName.toLowerCase().replace(/\s+/g, '-')}`,
    ];
    if (topicData.category) {
      tags.push(`category:${topicData.category.toLowerCase()}`);
    }

    const result = await storeToAutoMem({
      content: JSON.stringify(topicData),
      type: 'Context',
      tags,
      importance: 0.6,
      metadata: { entityType: 'topic', contactId, topicName, migrated: true },
    });

    if (result.success) {
      stats.topics.migrated++;
      console.log(`  ✓ Topic: ${topicName} (contact: ${contactId})`);
    } else {
      stats.topics.failed++;
      console.error(`  ✗ Topic: ${topicName} - ${result.error}`);
    }
  }
}

async function migrateEvents(): Promise<void> {
  console.log('\n[Migration] Migrating Events...');

  const query = `
    MATCH (c:Contact)-[:ATTENDING|:MENTIONED]->(e:Event)
    RETURN c.id AS contactId, e.name AS name, e.date AS date,
           e.location AS location, e.description AS description
  `;

  const events = await queryFalkorDB(query) as Record<string, unknown>[];
  stats.events.total = events.length;
  console.log(`  Found ${events.length} event relationships`);

  for (const event of events) {
    const contactId = event['contactId'] as string;
    const eventName = event['name'] as string;

    const eventData = {
      name: eventName,
      date: event['date'] as string | undefined,
      location: event['location'] as string | undefined,
      description: event['description'] as string | undefined,
    };

    const tags = [
      `contact:${contactId}`,
      'entity:event',
      `event:${eventName.toLowerCase().replace(/\s+/g, '-')}`,
    ];
    if (eventData.date) {
      const yearMonth = eventData.date.substring(0, 7);
      tags.push(`date:${yearMonth}`);
    }

    const result = await storeToAutoMem({
      content: JSON.stringify(eventData),
      type: 'Context',
      tags,
      importance: 0.65,
      metadata: { entityType: 'event', contactId, eventName, migrated: true },
    });

    if (result.success) {
      stats.events.migrated++;
      console.log(`  ✓ Event: ${eventName} (contact: ${contactId})`);
    } else {
      stats.events.failed++;
      console.error(`  ✗ Event: ${eventName} - ${result.error}`);
    }
  }
}

async function migratePersonas(): Promise<void> {
  console.log('\n[Migration] Migrating Personas...');

  const query = `
    MATCH (p:Persona)
    RETURN p.id AS id, p.name AS name, p.styleGuide AS styleGuide,
           p.tone AS tone, p.exampleMessages AS exampleMessages,
           p.applicableTo AS applicableTo
  `;

  const personas = await queryFalkorDB(query) as Record<string, unknown>[];
  stats.personas.total = personas.length;
  console.log(`  Found ${personas.length} personas`);

  for (const persona of personas) {
    const personaId = persona['id'] as string;

    let exampleMessages: string[] = [];
    let applicableTo: string[] = [];

    try {
      const rawExamples = persona['exampleMessages'];
      if (Array.isArray(rawExamples)) {
        exampleMessages = rawExamples;
      } else if (typeof rawExamples === 'string') {
        exampleMessages = JSON.parse(rawExamples);
      }

      const rawApplicable = persona['applicableTo'];
      if (Array.isArray(rawApplicable)) {
        applicableTo = rawApplicable;
      } else if (typeof rawApplicable === 'string') {
        applicableTo = JSON.parse(rawApplicable);
      }
    } catch {
      // Ignore parse errors
    }

    const personaData = {
      id: personaId,
      name: persona['name'] as string,
      styleGuide: persona['styleGuide'] as string,
      tone: persona['tone'] as string,
      exampleMessages,
      applicableTo,
    };

    const tags = [`persona:${personaId}`];
    for (const relType of applicableTo) {
      tags.push(`relationship:${relType.toLowerCase()}`);
    }

    const result = await storeToAutoMem({
      content: JSON.stringify(personaData),
      type: 'Style',
      tags,
      importance: 0.9,
      metadata: { entityType: 'persona', personaId, personaName: personaData.name, migrated: true },
    });

    if (result.success) {
      stats.personas.migrated++;
      console.log(`  ✓ Persona: ${personaData.name} (${personaId})`);
    } else {
      stats.personas.failed++;
      console.error(`  ✗ Persona: ${personaData.name} - ${result.error}`);
    }
  }
}

async function checkAutoMemHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${AUTOMEM_API_URL}/health`, {
      headers: AUTOMEM_API_TOKEN ? { Authorization: `Bearer ${AUTOMEM_API_TOKEN}` } : {},
    });

    if (!response.ok) {
      console.error(`[Migration] AutoMem health check failed: ${response.status}`);
      return false;
    }

    const data = await response.json() as { status: string };
    console.log(`[Migration] AutoMem status: ${data.status}`);
    return data.status === 'healthy';
  } catch (error) {
    console.error(`[Migration] AutoMem not reachable: ${error}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('SecondMe: FalkorDB to AutoMem Migration');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n*** DRY RUN MODE - No data will be written ***\n');
  }

  // Check AutoMem health
  if (!DRY_RUN) {
    console.log('\n[Migration] Checking AutoMem health...');
    const healthy = await checkAutoMemHealth();
    if (!healthy) {
      console.error('[Migration] AutoMem is not healthy. Aborting.');
      process.exit(1);
    }
  }

  // Connect to FalkorDB
  console.log('\n[Migration] Connecting to FalkorDB...');
  await initFalkorDB();

  try {
    // Run migrations
    await migrateContacts();
    await migratePersonsAndRelationships();
    await migrateTopics();
    await migrateEvents();
    await migratePersonas();

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`\nContacts:       ${stats.contacts.migrated}/${stats.contacts.total} migrated, ${stats.contacts.failed} failed`);
    console.log(`Persons:        ${stats.persons.migrated}/${stats.persons.total} migrated, ${stats.persons.failed} failed`);
    console.log(`Topics:         ${stats.topics.migrated}/${stats.topics.total} migrated, ${stats.topics.failed} failed`);
    console.log(`Events:         ${stats.events.migrated}/${stats.events.total} migrated, ${stats.events.failed} failed`);
    console.log(`Personas:       ${stats.personas.migrated}/${stats.personas.total} migrated, ${stats.personas.failed} failed`);
    console.log(`Style Profiles: ${stats.styleProfiles.migrated}/${stats.styleProfiles.total} migrated, ${stats.styleProfiles.failed} failed`);

    const totalMigrated =
      stats.contacts.migrated +
      stats.persons.migrated +
      stats.topics.migrated +
      stats.events.migrated +
      stats.personas.migrated +
      stats.styleProfiles.migrated;

    const totalFailed =
      stats.contacts.failed +
      stats.persons.failed +
      stats.topics.failed +
      stats.events.failed +
      stats.personas.failed +
      stats.styleProfiles.failed;

    console.log(`\nTotal: ${totalMigrated} migrated, ${totalFailed} failed`);

    if (totalFailed > 0) {
      console.log('\n⚠️  Some migrations failed. Please review the errors above.');
      process.exit(1);
    } else {
      console.log('\n✓ Migration completed successfully!');
      if (DRY_RUN) {
        console.log('\nRun without --dry-run to actually migrate the data.');
      }
    }
  } finally {
    await closeFalkorDB();
  }
}

main().catch((error) => {
  console.error('[Migration] Fatal error:', error);
  process.exit(1);
});
