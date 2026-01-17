/**
 * Session API Route
 * Proxies session info requests to the Gateway service
 */

import { NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';

/**
 * GET /api/session - Get current WhatsApp session info
 */
export async function GET() {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/session`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add timeout
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Return a default state when Gateway is unavailable
      return NextResponse.json({
        isActive: false,
        needsRefresh: false,
        timeRemaining: { hours: 0, minutes: 0, isExpiring: false },
        state: 'UNKNOWN',
        createdAt: null,
        expiresAt: null,
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Session API] Error fetching session info:', error);

    // Return a graceful fallback when Gateway is unreachable
    return NextResponse.json({
      isActive: false,
      needsRefresh: false,
      timeRemaining: { hours: 0, minutes: 0, isExpiring: false },
      state: 'DISCONNECTED',
      createdAt: null,
      expiresAt: null,
      error: 'Gateway unreachable',
    });
  }
}

/**
 * POST /api/session/refresh - Trigger session refresh
 */
export async function POST() {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/session/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to refresh session' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Session API] Error refreshing session:', error);
    return NextResponse.json(
      { error: 'Gateway unreachable' },
      { status: 503 }
    );
  }
}
