/**
 * Persona API Route - Individual Persona Operations
 * User Story 2: Handles GET, PATCH, DELETE for individual personas
 */

import { NextRequest, NextResponse } from 'next/server';

// FalkorDB configuration
const FALKORDB_HOST = process.env['FALKORDB_HOST'] || 'localhost';
const FALKORDB_PORT = process.env['FALKORDB_PORT'] || '6379';
const FALKORDB_PASSWORD = process.env['FALKORDB_PASSWORD'] || 'falkordb_default_password';
const GRAPH_NAME = 'knowledge_graph';

/**
 * Execute a Cypher query against FalkorDB
 */
async function queryFalkorDB(query: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
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

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/persona/[id] - Get a single persona
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const query = `
      MATCH (p:Persona {id: $personaId})
      RETURN p.id AS id, p.name AS name, p.styleGuide AS styleGuide,
             p.tone AS tone, p.exampleMessages AS exampleMessages,
             p.applicableTo AS applicableTo
    `;

    const results = await queryFalkorDB(query, { personaId: id });

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    const row = results[0] as Record<string, unknown>;
    const persona = {
      id: row['id'],
      name: row['name'],
      styleGuide: row['styleGuide'],
      tone: row['tone'],
      exampleMessages: row['exampleMessages'] || [],
      applicableTo: row['applicableTo'] || [],
    };

    return NextResponse.json(persona);
  } catch (error: unknown) {
    console.error('[Persona API] Error fetching persona:', error);
    return NextResponse.json(
      { error: 'Failed to fetch persona' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/persona/[id] - Update a persona
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Build SET clause dynamically
    const setClauses: string[] = ['p.updatedAt = timestamp()'];
    const queryParams: Record<string, unknown> = { personaId: id };

    if (body.name !== undefined) {
      setClauses.push('p.name = $name');
      queryParams['name'] = body.name;
    }
    if (body.styleGuide !== undefined) {
      setClauses.push('p.styleGuide = $styleGuide');
      queryParams['styleGuide'] = body.styleGuide;
    }
    if (body.tone !== undefined) {
      setClauses.push('p.tone = $tone');
      queryParams['tone'] = body.tone;
    }
    if (body.exampleMessages !== undefined) {
      setClauses.push('p.exampleMessages = $exampleMessages');
      queryParams['exampleMessages'] = body.exampleMessages;
    }
    if (body.applicableTo !== undefined) {
      setClauses.push('p.applicableTo = $applicableTo');
      queryParams['applicableTo'] = body.applicableTo;
    }

    const query = `
      MATCH (p:Persona {id: $personaId})
      SET ${setClauses.join(', ')}
      RETURN p.id AS id
    `;

    const results = await queryFalkorDB(query, queryParams);

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    // Invalidate persona cache in Redis
    try {
      const Redis = (await import('ioredis')).default;
      const redisClient = new Redis({
        host: process.env['REDIS_HOST'] || 'localhost',
        port: parseInt(process.env['REDIS_PORT'] || '6380', 10),
      });

      // Clear all persona caches (simple approach for MVP)
      const keys = await redisClient.keys('CACHE:persona:*');
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }

      await redisClient.quit();
    } catch (cacheError) {
      console.warn('[Persona API] Failed to invalidate cache:', cacheError);
    }

    return NextResponse.json({
      id,
      message: 'Persona updated successfully',
    });
  } catch (error: unknown) {
    console.error('[Persona API] Error updating persona:', error);
    return NextResponse.json(
      { error: 'Failed to update persona' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/persona/[id] - Delete a persona
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Prevent deletion of default personas
    if (id.startsWith('persona-professional') || id.startsWith('persona-casual') || id.startsWith('persona-family')) {
      return NextResponse.json(
        { error: 'Cannot delete default personas' },
        { status: 400 }
      );
    }

    const query = `
      MATCH (p:Persona {id: $personaId})
      DETACH DELETE p
      RETURN count(*) AS deleted
    `;

    await queryFalkorDB(query, { personaId: id });

    return NextResponse.json({
      message: 'Persona deleted successfully',
    });
  } catch (error: unknown) {
    console.error('[Persona API] Error deleting persona:', error);
    return NextResponse.json(
      { error: 'Failed to delete persona' },
      { status: 500 }
    );
  }
}
