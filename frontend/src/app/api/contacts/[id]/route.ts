/**
 * Individual Contact API Route
 * User Story 2: GET and PATCH operations for a specific contact
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';

// FalkorDB configuration
const FALKORDB_HOST = process.env['FALKORDB_HOST'] || 'localhost';
const FALKORDB_PORT = process.env['FALKORDB_PORT'] || '6379';
const FALKORDB_PASSWORD = process.env['FALKORDB_PASSWORD'] || 'falkordb_default_password';
const GRAPH_NAME = 'knowledge_graph';

/**
 * Request body for PATCH /api/contacts/[id]
 */
interface PatchContactBody {
  assignedPersona?: string | null;
  relationshipType?: string;
  botEnabled?: boolean;
}

/**
 * Execute a Cypher query against FalkorDB
 */
async function queryFalkorDB(
  query: string,
  params: Record<string, unknown> = {}
): Promise<unknown[]> {
  const ioredis = await import('ioredis');
  const Redis = ioredis.default;

  const client = new Redis({
    host: FALKORDB_HOST,
    port: parseInt(FALKORDB_PORT, 10),
    password: FALKORDB_PASSWORD,
    maxRetriesPerRequest: 3,
  });

  try {
    // Build CYPHER prefix with parameters
    // FalkorDB requires: CYPHER param1=value1 param2=value2 MATCH ...
    const cypherPrefix = Object.entries(params)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');

    const fullQuery = cypherPrefix ? `CYPHER ${cypherPrefix} ${query}` : query;
    const result = await client.call('GRAPH.QUERY', GRAPH_NAME, fullQuery);

    return parseGraphResult(result);
  } finally {
    await client.quit();
  }
}

/**
 * Parse FalkorDB result into readable format
 */
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

/**
 * GET /api/contacts/[id] - Get a specific contact with persona info
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params;

    // Get contact with optional assigned persona name
    const query = `
      MATCH (c:Contact {id: $contactId})
      OPTIONAL MATCH (p:Persona {id: c.assignedPersona})
      RETURN c.id AS id, c.name AS name, c.phoneNumber AS phoneNumber,
             c.relationshipType AS relationshipType,
             c.relationshipConfidence AS relationshipConfidence,
             c.relationshipSource AS relationshipSource,
             c.botEnabled AS botEnabled,
             c.assignedPersona AS assignedPersona, p.name AS assignedPersonaName,
             c.lastInteraction AS lastInteraction
      LIMIT 1
    `;

    const results = await queryFalkorDB(query, { contactId });

    // Decode contactId in case it's URL-encoded
    const decodedContactId = decodeURIComponent(contactId);

    // Get pause status from Redis - check global and contact-specific separately
    const isGlobalPaused = await redisClient.isGlobalPauseActive();
    const pauseInfo = await redisClient.getContactPauseInfo(decodedContactId);
    const isContactPaused = pauseInfo !== null;
    const isPaused = isGlobalPaused || isContactPaused;

    // Try to get contact info from Redis (always has the real name from WhatsApp)
    let redisContact: { id: string; name?: string; phoneNumber?: string } | undefined;
    try {
      const cached = await redisClient.client.get('CONTACTS:list');
      if (cached) {
        const contacts = JSON.parse(cached) as Array<{ id: string; name?: string; phoneNumber?: string }>;
        redisContact = contacts.find(
          (c) => c.id === decodedContactId || c.id === contactId
        );
      }
    } catch (err) {
      console.error('[Contact API] Redis lookup failed:', err);
    }

    // If contact not in FalkorDB, use Redis data (or 404 if not in Redis either)
    if (results.length === 0) {
      if (!redisContact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      }

      // Build contact from Redis data only
      const contact = {
        id: redisContact.id,
        name: redisContact.name && !redisContact.name.endsWith('@c.us')
          ? redisContact.name
          : decodedContactId.replace('@c.us', ''),
        phoneNumber: redisContact.phoneNumber || decodedContactId.replace('@c.us', ''),
        relationshipType: 'acquaintance',
        relationshipConfidence: null,
        relationshipSource: null,
        botEnabled: false,
        isPaused,
        isGlobalPaused,
        isContactPaused,
        assignedPersona: undefined,
        assignedPersonaName: undefined,
        lastInteraction: undefined,
      };

      return NextResponse.json({ contact });
    }

    // FalkorDB has the contact - merge with Redis data for name
    const row = results[0] as Record<string, unknown>;

    // Check if name is missing or is a raw ID (ends with @c.us)
    let contactName = row['name'] as string | undefined;
    const nameIsMissing = !contactName || contactName.endsWith('@c.us');

    if (nameIsMissing && redisContact?.name && !redisContact.name.endsWith('@c.us')) {
      contactName = redisContact.name;
    }

    // Final fallback: strip @c.us suffix
    if (!contactName || contactName.endsWith('@c.us')) {
      contactName = decodedContactId.replace('@c.us', '');
    }

    const contact = {
      id: row['id'],
      name: contactName,
      phoneNumber: row['phoneNumber'] || redisContact?.phoneNumber || undefined,
      relationshipType: row['relationshipType'] || 'acquaintance',
      relationshipConfidence: row['relationshipConfidence'] ?? null,
      relationshipSource: row['relationshipSource'] ?? null,
      botEnabled: row['botEnabled'] ?? false,
      isPaused,
      isGlobalPaused,
      isContactPaused,
      assignedPersona: row['assignedPersona'] || undefined,
      assignedPersonaName: row['assignedPersonaName'] || undefined,
      lastInteraction: row['lastInteraction'] || undefined,
    };

    return NextResponse.json({ contact });
  } catch (error: unknown) {
    console.error('[Contact API] Error fetching contact:', error);
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
  }
}

/**
 * PATCH /api/contacts/[id] - Update contact fields
 * Supports: assignedPersona (null to clear), relationshipType, botEnabled
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params;
    const body = (await request.json()) as PatchContactBody;

    // Build SET clause dynamically based on provided fields
    const setClause: string[] = ['c.updatedAt = timestamp()'];
    const queryParams: Record<string, unknown> = { contactId };

    // Handle assignedPersona (null = clear assignment)
    if ('assignedPersona' in body) {
      if (body.assignedPersona === null) {
        // Remove the property by setting to null
        setClause.push('c.assignedPersona = null');
      } else {
        setClause.push('c.assignedPersona = $assignedPersona');
        queryParams['assignedPersona'] = body.assignedPersona;
      }
    }

    // Handle relationshipType
    if ('relationshipType' in body && body.relationshipType) {
      setClause.push('c.relationshipType = $relationshipType');
      queryParams['relationshipType'] = body.relationshipType;
    }

    // Handle botEnabled
    if ('botEnabled' in body && typeof body.botEnabled === 'boolean') {
      setClause.push('c.botEnabled = $botEnabled');
      queryParams['botEnabled'] = body.botEnabled;
    }

    // If no fields to update, return early
    if (setClause.length === 1) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Use MERGE to create the contact if it doesn't exist
    // This handles the case where contacts exist in WhatsApp/Redis but not yet in FalkorDB
    const query = `
      MERGE (c:Contact {id: $contactId})
      ON CREATE SET c.createdAt = timestamp()
      SET ${setClause.join(', ')}
      RETURN c.id AS id, c.assignedPersona AS assignedPersona
    `;

    const results = await queryFalkorDB(query, queryParams);

    if (results.length === 0) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // If assignedPersona was updated, fetch the name
    let assignedPersonaName: string | undefined;
    const row = results[0] as Record<string, unknown>;
    if (row['assignedPersona']) {
      const personaQuery = `
        MATCH (p:Persona {id: $personaId})
        RETURN p.name AS name
        LIMIT 1
      `;
      const personaResults = await queryFalkorDB(personaQuery, {
        personaId: row['assignedPersona'],
      });
      if (personaResults.length > 0) {
        assignedPersonaName = (personaResults[0] as Record<string, unknown>)['name'] as string;
      }
    }

    return NextResponse.json({
      success: true,
      contact: {
        id: row['id'],
        assignedPersona: row['assignedPersona'] || null,
        assignedPersonaName: assignedPersonaName || null,
      },
    });
  } catch (error: unknown) {
    console.error('[Contact API] Error updating contact:', error);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
}
