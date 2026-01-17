/**
 * Persona API Route
 * User Story 2: Handles persona CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server';

// FalkorDB configuration
const FALKORDB_HOST = process.env['FALKORDB_HOST'] || 'localhost';
const FALKORDB_PORT = process.env['FALKORDB_PORT'] || '6379';
const FALKORDB_PASSWORD = process.env['FALKORDB_PASSWORD'] || 'falkordb_default_password';
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
    password: FALKORDB_PASSWORD,
    maxRetriesPerRequest: 3,
  });

  try {
    const paramsJson = JSON.stringify(params);
    const result = await client.call(
      'GRAPH.QUERY',
      GRAPH_NAME,
      query,
      '--params',
      paramsJson
    );

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

    const personas = results.map((row: Record<string, unknown>) => ({
      id: row['id'],
      name: row['name'],
      styleGuide: row['styleGuide'],
      tone: row['tone'],
      exampleMessages: row['exampleMessages'] || [],
      applicableTo: row['applicableTo'] || [],
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

    const query = `
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

    await queryFalkorDB(query, {
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
