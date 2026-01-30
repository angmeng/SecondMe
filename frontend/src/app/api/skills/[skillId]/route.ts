/**
 * Skill API Route - Individual skill operations
 * Proxies enable/disable and configuration updates to orchestrator service
 */

import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';

// Orchestrator service URL
const ORCHESTRATOR_URL = process.env['ORCHESTRATOR_URL'] || 'http://localhost:3002';

interface RouteParams {
  params: Promise<{
    skillId: string;
  }>;
}

/**
 * Helper to handle orchestrator fetch errors
 */
function handleFetchError(error: unknown, operation: string): NextResponse {
  console.error(`[API Skills] Error ${operation}:`, error);

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

/**
 * GET /api/skills/[skillId]
 * Get skill details (proxied from orchestrator)
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { skillId } = await params;

    const response = await fetch(`${ORCHESTRATOR_URL}/skills/${encodeURIComponent(skillId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        return NextResponse.json({ error: `Skill ${skillId} not found` }, { status: 404 });
      }
      throw new Error(errorData.error || `Orchestrator returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return handleFetchError(error, 'getting skill');
  }
}

/**
 * POST /api/skills/[skillId]
 * Enable a skill (proxied to orchestrator)
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { skillId } = await params;

    const response = await fetch(`${ORCHESTRATOR_URL}/skills/${encodeURIComponent(skillId)}/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        return NextResponse.json({ error: `Skill ${skillId} not found` }, { status: 404 });
      }
      throw new Error(errorData.error || `Orchestrator returned ${response.status}`);
    }

    const data = await response.json();
    console.log(`[API Skills] Enabled skill: ${skillId}`);

    return NextResponse.json(data);
  } catch (error) {
    return handleFetchError(error, 'enabling skill');
  }
}

/**
 * DELETE /api/skills/[skillId]
 * Disable a skill (proxied to orchestrator)
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { skillId } = await params;

    const response = await fetch(`${ORCHESTRATOR_URL}/skills/${encodeURIComponent(skillId)}/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        return NextResponse.json({ error: `Skill ${skillId} not found` }, { status: 404 });
      }
      throw new Error(errorData.error || `Orchestrator returned ${response.status}`);
    }

    const data = await response.json();
    console.log(`[API Skills] Disabled skill: ${skillId}`);

    return NextResponse.json(data);
  } catch (error) {
    return handleFetchError(error, 'disabling skill');
  }
}

/**
 * PUT /api/skills/[skillId]
 * Update skill configuration (proxied to orchestrator)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { skillId } = await params;
    const body = (await request.json()) as { config?: Record<string, unknown> };
    const { config } = body;

    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: 'Invalid config object' }, { status: 400 });
    }

    const response = await fetch(`${ORCHESTRATOR_URL}/skills/${encodeURIComponent(skillId)}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        return NextResponse.json({ error: `Skill ${skillId} not found` }, { status: 404 });
      }
      throw new Error(errorData.error || `Orchestrator returned ${response.status}`);
    }

    const data = await response.json();
    console.log(`[API Skills] Updated config for skill: ${skillId}`);

    return NextResponse.json(data);
  } catch (error) {
    return handleFetchError(error, 'updating skill config');
  }
}
