/**
 * Status API
 * T105: Centralized endpoint to fetch connection status from Gateway
 */

import { NextResponse } from 'next/server';

interface StatusResponse {
  connected: boolean;
  status: 'connected' | 'disconnected' | 'offline' | 'error';
  redis?: string;
  timestamp: string;
  error?: string;
}

export async function GET(): Promise<NextResponse<StatusResponse>> {
  const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';

  try {
    const response = await fetch(`${GATEWAY_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json({
        connected: false,
        status: 'offline',
        timestamp: new Date().toISOString(),
        error: 'Gateway unavailable',
      });
    }

    const data = await response.json();
    return NextResponse.json({
      connected: data.whatsapp === 'connected',
      status: data.whatsapp || 'disconnected',
      redis: data.redis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Failed to reach Gateway',
      },
      { status: 503 }
    );
  }
}
