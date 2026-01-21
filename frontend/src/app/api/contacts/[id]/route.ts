/**
 * Individual Contact API Route
 * User Story 2: GET and PATCH operations for a specific contact
 * Uses AutoMem for metadata storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import {
  getContactMetadata,
  updateContactMetadata,
  getPersonaName,
} from '@/lib/automem-client';

/**
 * Request body for PATCH /api/contacts/[id]
 */
interface PatchContactBody {
  assignedPersona?: string | null;
  relationshipType?: string;
  botEnabled?: boolean;
}

/**
 * GET /api/contacts/[id] - Get a specific contact with persona info
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params;

    // Decode contactId in case it's URL-encoded
    const decodedContactId = decodeURIComponent(contactId);

    // Get pause status from Redis - check global and contact-specific separately
    const isGlobalPaused = await redisClient.isGlobalPauseActive();
    const pauseInfo = await redisClient.getContactPauseInfo(decodedContactId);
    const isContactPaused = pauseInfo !== null;
    const isPaused = isGlobalPaused || isContactPaused;

    // Try to get contact info from Redis (always has the real name from WhatsApp)
    let redisContact: { id: string; name?: string; phoneNumber?: string } | undefined;
    try {
      const cached = await redisClient.client.get('CONTACTS:list');
      if (cached) {
        const contacts = JSON.parse(cached) as Array<{ id: string; name?: string; phoneNumber?: string }>;
        redisContact = contacts.find(
          (c) => c.id === decodedContactId || c.id === contactId
        );
      }
    } catch (err) {
      console.error('[Contact API] Redis lookup failed:', err);
    }

    // Get contact metadata from AutoMem
    const metadata = await getContactMetadata(decodedContactId);

    // Get assigned persona name if there's a persona assigned
    let assignedPersonaName: string | undefined;
    const assignedPersonaId = metadata?.assignedPersona;
    if (assignedPersonaId) {
      assignedPersonaName = (await getPersonaName(assignedPersonaId)) || undefined;
    }

    // If we have no data from either source, return 404
    if (!metadata && !redisContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Determine contact name (prefer Redis as it has WhatsApp-provided name)
    let contactName = metadata?.name;
    if (!contactName || contactName.endsWith('@c.us')) {
      if (redisContact?.name && !redisContact.name.endsWith('@c.us')) {
        contactName = redisContact.name;
      } else {
        contactName = decodedContactId.replace('@c.us', '');
      }
    }

    // Build the contact response
    const contact = {
      id: decodedContactId,
      name: contactName,
      phoneNumber: metadata?.phoneNumber || redisContact?.phoneNumber || decodedContactId.replace('@c.us', ''),
      relationshipType: metadata?.relationshipType || 'acquaintance',
      relationshipConfidence: metadata?.relationshipConfidence ?? null,
      relationshipSource: metadata?.relationshipSource ?? null,
      botEnabled: metadata?.botEnabled ?? false,
      isPaused,
      isGlobalPaused,
      isContactPaused,
      assignedPersona: assignedPersonaId || undefined,
      assignedPersonaName: assignedPersonaName || undefined,
      lastInteraction: metadata?.lastInteraction || undefined,
    };

    return NextResponse.json({ contact });
  } catch (error: unknown) {
    console.error('[Contact API] Error fetching contact:', error);
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
  }
}

/**
 * PATCH /api/contacts/[id] - Update contact fields
 * Supports: assignedPersona (null to clear), relationshipType, botEnabled
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params;
    const body = (await request.json()) as PatchContactBody;

    // Decode contactId in case it's URL-encoded
    const decodedContactId = decodeURIComponent(contactId);

    // Build updates object from provided fields
    const updates: Partial<{
      assignedPersona?: string;
      relationshipType?: string;
      botEnabled?: boolean;
    }> = {};

    // Handle assignedPersona (null = clear assignment)
    if ('assignedPersona' in body) {
      if (body.assignedPersona === null) {
        updates.assignedPersona = undefined; // Clear assignment
      } else {
        updates.assignedPersona = body.assignedPersona;
      }
    }

    // Handle relationshipType
    if ('relationshipType' in body && body.relationshipType) {
      updates.relationshipType = body.relationshipType;
    }

    // Handle botEnabled
    if ('botEnabled' in body && typeof body.botEnabled === 'boolean') {
      updates.botEnabled = body.botEnabled;
    }

    // If no fields to update, return early
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Update contact metadata in AutoMem
    await updateContactMetadata(decodedContactId, updates);

    // Get assigned persona name if there's a persona assigned
    let assignedPersonaName: string | null = null;
    if (updates.assignedPersona) {
      assignedPersonaName = await getPersonaName(updates.assignedPersona);
    }

    return NextResponse.json({
      success: true,
      contact: {
        id: decodedContactId,
        assignedPersona: updates.assignedPersona || null,
        assignedPersonaName: assignedPersonaName,
      },
    });
  } catch (error: unknown) {
    console.error('[Contact API] Error updating contact:', error);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
}
