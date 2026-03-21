/**
 * Skills API Route
 * Proxies skill operations to the orchestrator service
 */

import { NextResponse } from 'next/server';
import { serviceProxyError } from '@/lib/errors';
import { ORCHESTRATOR_URL } from '@/lib/service-urls';

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
    const { body, status } = serviceProxyError(error, 'API Skills', 'Orchestrator', 3002);
    return NextResponse.json(body, { status });
  }
}
