/**
 * Pause Control API Route
 * Server Actions for setting/clearing contact-specific pause
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import { getErrorMessage } from '@/lib/errors';

/**
 * POST /api/pause - Set pause for contact (indefinite)
 * Body: { contactId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId } = body;

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
    }

    await redisClient.setContactPause(contactId);

    return NextResponse.json({
      success: true,
      contactId,
      pausedAt: Date.now(),
    });
  } catch (error) {
    console.error('[Pause API] Error setting pause:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
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
  } catch (error) {
    console.error('[Pause API] Error clearing pause:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
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
    const pauseInfo = await redisClient.getContactPauseInfo(contactId);

    return NextResponse.json({
      contactId,
      isPaused,
      pausedAt: pauseInfo?.pausedAt ?? null,
      reason: pauseInfo?.reason ?? null,
    });
  } catch (error) {
    console.error('[Pause API] Error checking pause:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
