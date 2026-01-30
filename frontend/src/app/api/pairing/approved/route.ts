/**
 * Approved Contacts API Route
 * Handles listing and managing approved contacts
 */

import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import { getErrorMessage } from '@/lib/errors';

/**
 * GET /api/pairing/approved
 * List all approved contacts
 */
export async function GET() {
  try {
    const contacts = await redisClient.listApprovedContacts();

    return NextResponse.json({
      success: true,
      contacts,
      count: contacts.length,
    });
  } catch (error) {
    console.error('[API Pairing] Error listing approved contacts:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
