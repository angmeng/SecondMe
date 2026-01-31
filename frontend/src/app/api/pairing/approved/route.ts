/**
 * Approved Contacts API Route
 * Handles listing and managing approved contacts
 */

import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import { getErrorMessage } from '@/lib/errors';
import type { EnrichedApprovedContact } from '@secondme/shared-types';

/**
 * GET /api/pairing/approved
 * List all approved contacts with linked channels info
 */
export async function GET() {
  try {
    const contacts = await redisClient.listApprovedContacts();

    // Batch fetch all linked channels
    const contactIds = contacts.map((c) => c.contactId);
    const linkedChannelsMap = await redisClient.getLinkedChannelsBatch(contactIds);

    // Enrich contacts with linked channels
    const enriched: EnrichedApprovedContact[] = contacts.map((contact) => {
      const linkedChannels = linkedChannelsMap.get(contact.contactId) || [];
      // Filter out the current contact from linked channels
      const otherChannels = linkedChannels.filter((c) => c.contactId !== contact.contactId);

      return {
        ...contact,
        linkedChannels: otherChannels.length > 0 ? otherChannels : undefined,
      };
    });

    return NextResponse.json({
      success: true,
      contacts: enriched,
      count: enriched.length,
    });
  } catch (error) {
    console.error('[API Pairing] Error listing approved contacts:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
