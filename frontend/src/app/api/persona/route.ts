/**
 * Persona API Route
 * User Story 2: Handles persona CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server';

// FalkorDB configuration
const FALKORDB_HOST = process.env['FALKORDB_HOST'] || 'localhost';
const FALKORDB_PORT = process.env['FALKORDB_PORT'] || '6379';
const FALKORDB_PASSWORD = process.env['FALKORDB_PASSWORD'];
const GRAPH_NAME = 'knowledge_graph';

// Default user ID (single-user MVP)
const DEFAULT_USER_ID = 'user-1';

/**
 * Execute a Cypher query against FalkorDB
 */
async function queryFalkorDB(query: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
  // Use dynamic import for Redis to avoid Next.js bundling issues
  const Redis = (await import('ioredis')).default;

  const client = new Redis({
    host: FALKORDB_HOST,
    port: parseInt(FALKORDB_PORT, 10),
    ...(FALKORDB_PASSWORD && { password: FALKORDB_PASSWORD }),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  try {
    // Warmup: ensure connection is ready before executing query
    await client.ping();

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
 * GET /api/persona - Get all personas for the user
 */
export async function GET() {
  try {
    const query = `
      MATCH (u:User {id: $userId})-[:HAS_PERSONA]->(p:Persona)
      RETURN p.id AS id, p.name AS name, p.styleGuide AS styleGuide,
             p.tone AS tone, p.exampleMessages AS exampleMessages,
             p.applicableTo AS applicableTo
      ORDER BY p.name
    `;

    const results = await queryFalkorDB(query, { userId: DEFAULT_USER_ID });

    // Helper to parse JSON string arrays from FalkorDB
    const parseArrayField = (value: unknown): string[] => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const personas = results.map((row: Record<string, unknown>) => ({
      id: row['id'],
      name: row['name'],
      styleGuide: row['styleGuide'],
      tone: row['tone'],
      exampleMessages: parseArrayField(row['exampleMessages']),
      applicableTo: parseArrayField(row['applicableTo']),
    }));

    return NextResponse.json({ personas });
  } catch (error: unknown) {
    console.error('[Persona API] Error fetching personas:', error);
    return NextResponse.json(
      { error: 'Failed to fetch personas' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/persona - Create a new persona
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, styleGuide, tone, exampleMessages, applicableTo } = body;

    if (!name || !styleGuide || !tone) {
      return NextResponse.json(
        { error: 'Name, styleGuide, and tone are required' },
        { status: 400 }
      );
    }

    const personaId = `persona-${Date.now()}`;

    // Step 1: Ensure user exists
    const ensureUserQuery = `
      MERGE (u:User {id: $userId})
      ON CREATE SET u.createdAt = timestamp()
      RETURN u.id AS id
    `;
    await queryFalkorDB(ensureUserQuery, { userId: DEFAULT_USER_ID });

    // Step 2: Create persona and link to user
    const createPersonaQuery = `
      MATCH (u:User {id: $userId})
      CREATE (p:Persona {
        id: $personaId,
        name: $name,
        styleGuide: $styleGuide,
        tone: $tone,
        exampleMessages: $exampleMessages,
        applicableTo: $applicableTo,
        createdAt: timestamp()
      })
      CREATE (u)-[:HAS_PERSONA]->(p)
      RETURN p.id AS id
    `;
    await queryFalkorDB(createPersonaQuery, {
      userId: DEFAULT_USER_ID,
      personaId,
      name,
      styleGuide,
      tone,
      exampleMessages: exampleMessages || [],
      applicableTo: applicableTo || [],
    });

    return NextResponse.json({
      id: personaId,
      message: 'Persona created successfully',
    });
  } catch (error: unknown) {
    console.error('[Persona API] Error creating persona:', error);
    return NextResponse.json(
      { error: 'Failed to create persona' },
      { status: 500 }
    );
  }
}
