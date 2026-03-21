/**
 * Channels API Route
 * Proxies channel list requests to gateway service
 */

import { NextResponse } from 'next/server';
import { serviceProxyError } from '@/lib/errors';
import { GATEWAY_URL } from '@/lib/service-urls';

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
    const { body, status } = serviceProxyError(error, 'API Channels', 'Gateway', 3001);
    return NextResponse.json({ ...body, channels: [] }, { status });
  }
}
