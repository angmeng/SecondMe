/**
 * Pause Control API Route
 * Server Actions for setting/clearing contact-specific pause
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';

/**
 * POST /api/pause - Set pause for contact
 * Body: { contactId: string, duration: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId, duration } = body;

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
    }

    const pauseDuration = duration || 3600; // Default 1 hour

    await redisClient.setContactPause(contactId, pauseDuration);

    return NextResponse.json({
      success: true,
      contactId,
      duration: pauseDuration,
      expiresAt: Date.now() + pauseDuration * 1000,
    });
  } catch (error: any) {
    console.error('[Pause API] Error setting pause:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to set pause' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pause?contactId={contactId} - Clear pause for contact
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
    }

    await redisClient.clearContactPause(contactId);

    return NextResponse.json({
      success: true,
      contactId,
    });
  } catch (error: any) {
    console.error('[Pause API] Error clearing pause:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear pause' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/pause?contactId={contactId} - Check if contact is paused
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
    }

    const isPaused = await redisClient.isContactPaused(contactId);
    const expiresAt = await redisClient.getContactPauseExpiration(contactId);

    return NextResponse.json({
      contactId,
      isPaused,
      expiresAt,
    });
  } catch (error: any) {
    console.error('[Pause API] Error checking pause:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check pause' },
      { status: 500 }
    );
  }
}
