/**
 * Skills API Route
 * Proxies skill operations to the orchestrator service
 */

import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';

// Orchestrator service URL
const ORCHESTRATOR_URL = process.env['ORCHESTRATOR_URL'] || 'http://localhost:3002';

/**
 * GET /api/skills
 * List all skills with their status (proxied from orchestrator)
 */
export async function GET() {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/skills`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Prevent caching to always get fresh data
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Orchestrator returned ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      skills: data.skills,
      count: data.count,
    });
  } catch (error) {
    console.error('[API Skills] Error listing skills:', error);

    // Check if it's a connection error (orchestrator not running)
    const errorMessage = getErrorMessage(error);
    const isConnectionError = errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed');

    return NextResponse.json(
      {
        error: isConnectionError
          ? 'Orchestrator service unavailable. Ensure it is running on port 3002.'
          : errorMessage,
      },
      { status: isConnectionError ? 503 : 500 }
    );
  }
}
