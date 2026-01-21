/**
 * Persona API Route
 * User Story 2: Handles persona CRUD operations
 * Uses AutoMem for storage
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPersonas,
  createPersona,
} from '@/lib/automem-client';

/**
 * GET /api/persona - Get all personas for the user
 */
export async function GET() {
  try {
    const personas = await getPersonas();

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

    const personaId = await createPersona({
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
