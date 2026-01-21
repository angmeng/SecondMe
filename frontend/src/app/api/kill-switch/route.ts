/**
 * Master Kill Switch API Route
 * Server Actions for global pause control (PAUSE:ALL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import { getErrorMessage } from '@/lib/errors';

/**
 * POST /api/kill-switch - Enable master kill switch (global pause)
 * Body: { duration?: number } - optional duration in seconds, 0 = indefinite
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { duration = 0 } = body;

    await redisClient.setGlobalPause(duration);

    return NextResponse.json({
      success: true,
      enabled: true,
      duration,
      expiresAt: duration > 0 ? Date.now() + duration * 1000 : null,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Kill Switch API] Error enabling kill switch:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/kill-switch - Disable master kill switch (clear global pause)
 * Safety: Automatically pauses all contacts so user must enable them one by one
 */
export async function DELETE(_request: NextRequest) {
  try {
    // Before clearing global pause, set individual pauses for all known contacts
    // This ensures no contact becomes active automatically - user must enable each manually
    // First ensure Redis connection by calling a method that does so
    await redisClient.isGlobalPauseActive();
    const cached = await redisClient.client.get('CONTACTS:list');
    if (cached) {
      const contacts = JSON.parse(cached) as Array<{ id: string }>;
      const PAUSE_DURATION = 86400 * 365; // 1 year (effectively indefinite)

      // Pause all contacts
      await Promise.all(
        contacts.map((contact) => redisClient.setContactPause(contact.id, PAUSE_DURATION))
      );

      console.log(`[Kill Switch API] Paused ${contacts.length} contacts before disabling global pause`);
    }

    // Now clear the global pause
    await redisClient.clearGlobalPause();

    return NextResponse.json({
      success: true,
      enabled: false,
      timestamp: Date.now(),
      message: 'Kill switch disabled. All contacts are paused - enable them individually.',
    });
  } catch (error) {
    console.error('[Kill Switch API] Error disabling kill switch:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/kill-switch - Check if master kill switch is enabled
 */
export async function GET(_request: NextRequest) {
  try {
    const isEnabled = await redisClient.isGlobalPauseActive();

    return NextResponse.json({
      enabled: isEnabled,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Kill Switch API] Error checking kill switch:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
