/**
 * Skill API Route - Individual skill operations
 * Proxies enable/disable and configuration updates to orchestrator service
 */

import { NextRequest, NextResponse } from 'next/server';
import { serviceProxyError } from '@/lib/errors';
import { createAuditLogger } from '@/lib/audit';
import { ORCHESTRATOR_URL } from '@/lib/service-urls';

interface RouteParams {
  params: Promise<{
    skillId: string;
  }>;
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
    const { body, status } = serviceProxyError(error, 'API Skills', 'Orchestrator', 3002);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/skills/[skillId]
 * Enable a skill (proxied to orchestrator)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const audit = createAuditLogger(request);

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
    audit('ENABLE_SKILL', 'skills', skillId);
    console.log(`[API Skills] Enabled skill: ${skillId}`);

    return NextResponse.json(data);
  } catch (error) {
    const { body, status } = serviceProxyError(error, 'API Skills', 'Orchestrator', 3002);
    return NextResponse.json(body, { status });
  }
}

/**
 * DELETE /api/skills/[skillId]
 * Disable a skill (proxied to orchestrator)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const audit = createAuditLogger(request);

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
    audit('DISABLE_SKILL', 'skills', skillId);
    console.log(`[API Skills] Disabled skill: ${skillId}`);

    return NextResponse.json(data);
  } catch (error) {
    const { body, status } = serviceProxyError(error, 'API Skills', 'Orchestrator', 3002);
    return NextResponse.json(body, { status });
  }
}

/**
 * PUT /api/skills/[skillId]
 * Update skill configuration (proxied to orchestrator)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const audit = createAuditLogger(request);

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
    audit('UPDATE_SKILL_CONFIG', 'skills', skillId, { configKeys: Object.keys(config) });
    console.log(`[API Skills] Updated config for skill: ${skillId}`);

    return NextResponse.json(data);
  } catch (error) {
    const { body, status } = serviceProxyError(error, 'API Skills', 'Orchestrator', 3002);
    return NextResponse.json(body, { status });
  }
}
