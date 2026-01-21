/**
 * Persona API Route - Individual Persona Operations
 * User Story 2: Handles GET, PATCH, DELETE for individual personas
 * Uses AutoMem for storage
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPersonaById,
  updatePersona,
  deletePersona,
} from '@/lib/automem-client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/persona/[id] - Get a single persona
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const persona = await getPersonaById(id);

    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    return NextResponse.json(persona);
  } catch (error: unknown) {
    console.error('[Persona API] Error fetching persona:', error);
    return NextResponse.json({ error: 'Failed to fetch persona' }, { status: 500 });
  }
}

/**
 * PATCH /api/persona/[id] - Update a persona
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Build updates object from provided fields
    const updates: Partial<{
      name: string;
      styleGuide: string;
      tone: string;
      exampleMessages: string[];
      applicableTo: string[];
    }> = {};

    if (body.name !== undefined) {
      updates.name = body.name;
    }
    if (body.styleGuide !== undefined) {
      updates.styleGuide = body.styleGuide;
    }
    if (body.tone !== undefined) {
      updates.tone = body.tone;
    }
    if (body.exampleMessages !== undefined) {
      updates.exampleMessages = body.exampleMessages;
    }
    if (body.applicableTo !== undefined) {
      updates.applicableTo = body.applicableTo;
    }

    try {
      await updatePersona(id, updates);
    } catch (error) {
      if (error instanceof Error && error.message === 'Persona not found') {
        return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
      }
      throw error;
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
    return NextResponse.json({ error: 'Failed to update persona' }, { status: 500 });
  }
}

/**
 * DELETE /api/persona/[id] - Delete a persona
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Prevent deletion of default personas
    if (
      id.startsWith('persona-professional') ||
      id.startsWith('persona-casual') ||
      id.startsWith('persona-family')
    ) {
      return NextResponse.json({ error: 'Cannot delete default personas' }, { status: 400 });
    }

    // Check if persona exists first
    const existing = await getPersonaById(id);

    if (!existing) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    // Delete the persona
    await deletePersona(id);

    return NextResponse.json({
      message: 'Persona deleted successfully',
    });
  } catch (error: unknown) {
    console.error('[Persona API] Error deleting persona:', error);
    return NextResponse.json({ error: 'Failed to delete persona' }, { status: 500 });
  }
}
