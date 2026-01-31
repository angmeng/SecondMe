/**
 * Channels API Route
 * Proxies channel list requests to gateway service
 */

import { NextResponse } from 'next/server';

const GATEWAY_URL = process.env['GATEWAY_URL'] || 'http://localhost:3001';

/**
 * GET /api/channels
 * List all channels with their status
 */
export async function GET() {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/channels`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Gateway error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Channels] Error fetching channels:', error);

    const isConnectionError =
      error instanceof Error &&
      (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed'));

    return NextResponse.json(
      {
        error: isConnectionError
          ? 'Gateway service unavailable. Ensure it is running on port 3001.'
          : 'Failed to fetch channels',
        channels: [],
      },
      { status: isConnectionError ? 503 : 500 }
    );
  }
}
