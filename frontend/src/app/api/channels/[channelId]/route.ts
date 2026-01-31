/**
 * Channel API Route - Individual channel operations
 * Proxies enable/disable requests to gateway service
 */

import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env['GATEWAY_URL'] || 'http://localhost:3001';

interface RouteParams {
  params: Promise<{
    channelId: string;
  }>;
}

/**
 * POST /api/channels/[channelId]
 * Enable or disable a channel based on action in request body
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { channelId } = await params;
    const body = await request.json();
    const { action } = body as { action?: string };

    if (action !== 'enable' && action !== 'disable') {
      return NextResponse.json(
        { error: 'Invalid action. Use "enable" or "disable"' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${GATEWAY_URL}/api/channels/${encodeURIComponent(channelId)}/${action}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.error || `Failed to ${action} channel` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`[API Channels] ${action}d channel: ${channelId}`);

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Channels] Error updating channel:', error);

    const isConnectionError =
      error instanceof Error &&
      (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed'));

    return NextResponse.json(
      {
        error: isConnectionError
          ? 'Gateway service unavailable. Ensure it is running on port 3001.'
          : 'Failed to update channel',
      },
      { status: isConnectionError ? 503 : 500 }
    );
  }
}
