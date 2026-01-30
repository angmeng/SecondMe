/**
 * Approved Contact API Route
 * Handles updating tier and revoking approval for specific contacts
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import { getErrorMessage } from '@/lib/errors';
import type { ContactTier } from '@secondme/shared-types';

interface RouteParams {
  params: Promise<{ contactId: string }>;
}

/**
 * PUT /api/pairing/approved/[contactId]
 * Update contact tier
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { contactId } = await params;
    const body = await request.json();
    const { tier } = body as { tier: ContactTier };

    // Validate tier
    if (!['trusted', 'standard', 'restricted'].includes(tier)) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be trusted, standard, or restricted' },
        { status: 400 }
      );
    }

    const updated = await redisClient.updateContactTier(contactId, tier);

    if (!updated) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      contact: updated,
    });
  } catch (error) {
    console.error('[API Pairing] Error updating contact tier:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/pairing/approved/[contactId]
 * Revoke approval
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { contactId } = await params;

    await redisClient.revokeApproval(contactId);

    return NextResponse.json({
      success: true,
      contactId,
      action: 'revoked',
    });
  } catch (error) {
    console.error('[API Pairing] Error revoking approval:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/pairing/approved/[contactId]
 * Get approved contact details
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { contactId } = await params;

    const contact = await redisClient.getApprovedContact(contactId);

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      contact,
    });
  } catch (error) {
    console.error('[API Pairing] Error getting contact:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
