/**
 * Pairing Contact API Route
 * Handles approve/deny actions for specific contacts
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import { getErrorMessage } from '@/lib/errors';
import type { ContactTier } from '@secondme/shared-types';

interface RouteParams {
  params: Promise<{ contactId: string }>;
}

/**
 * POST /api/pairing/[contactId]
 * Approve a contact
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { contactId } = await params;
    const body = await request.json();
    const { tier = 'standard', notes } = body as { tier?: ContactTier; notes?: string };

    // Validate tier
    if (!['trusted', 'standard', 'restricted'].includes(tier)) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be trusted, standard, or restricted' },
        { status: 400 }
      );
    }

    const approved = await redisClient.approveContact(
      contactId,
      'dashboard-admin', // TODO: Add actual user auth
      tier,
      notes
    );

    return NextResponse.json({
      success: true,
      contact: approved,
    });
  } catch (error) {
    console.error('[API Pairing] Error approving contact:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/pairing/[contactId]
 * Deny a contact
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { contactId } = await params;

    // Parse body for reason (optional)
    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      // No body or invalid JSON, that's okay
    }

    await redisClient.denyContact(contactId, 'dashboard-admin', reason);

    return NextResponse.json({
      success: true,
      contactId,
      action: 'denied',
    });
  } catch (error) {
    console.error('[API Pairing] Error denying contact:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/pairing/[contactId]
 * Get pending request details
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { contactId } = await params;

    const pending = await redisClient.getPendingRequest(contactId);

    if (!pending) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      request: pending,
    });
  } catch (error) {
    console.error('[API Pairing] Error getting request:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
