/**
 * Master Kill Switch API Route
 * Server Actions for global pause control (PAUSE:ALL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';

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
  } catch (error: any) {
    console.error('[Kill Switch API] Error enabling kill switch:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to enable kill switch' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/kill-switch - Disable master kill switch (clear global pause)
 */
export async function DELETE(_request: NextRequest) {
  try {
    await redisClient.clearGlobalPause();

    return NextResponse.json({
      success: true,
      enabled: false,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('[Kill Switch API] Error disabling kill switch:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to disable kill switch' },
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
  } catch (error: any) {
    console.error('[Kill Switch API] Error checking kill switch:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check kill switch' },
      { status: 500 }
    );
  }
}
