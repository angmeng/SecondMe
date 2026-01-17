/**
 * Contacts API Route
 * Fetches cached WhatsApp contacts from Redis
 */

import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';

/**
 * GET /api/contacts - Get all cached contacts with pause status
 */
export async function GET() {
  try {
    // Ensure Redis is connected by calling a method that ensures connection
    const isGlobalPaused = await redisClient.isGlobalPauseActive();

    // Get cached contacts
    const cached = await redisClient.client.get('CONTACTS:list');

    if (!cached) {
      return NextResponse.json({
        contacts: [],
        message: 'No contacts cached. WhatsApp may not be connected.',
      });
    }

    const contacts = JSON.parse(cached);

    // Enrich with pause status
    const enriched = await Promise.all(
      contacts.map(async (c: { id: string; name: string; phoneNumber: string }) => ({
        ...c,
        isPaused: isGlobalPaused || (await redisClient.isContactPaused(c.id)),
        expiresAt: await redisClient.getContactPauseExpiration(c.id),
      }))
    );

    return NextResponse.json({ contacts: enriched });
  } catch (error: any) {
    console.error('[Contacts API] Error fetching contacts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}
