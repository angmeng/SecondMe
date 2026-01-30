/**
 * Pairing API Route
 * Handles listing pending pairing requests
 */

import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import { getErrorMessage } from '@/lib/errors';

/**
 * GET /api/pairing
 * List all pending pairing requests
 */
export async function GET() {
  try {
    const requests = await redisClient.listPendingPairingRequests();

    return NextResponse.json({
      success: true,
      requests,
      count: requests.length,
    });
  } catch (error) {
    console.error('[API Pairing] Error listing pending requests:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
