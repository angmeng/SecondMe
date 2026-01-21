/**
 * Contacts API Route
 * Fetches cached WhatsApp contacts from Redis
 */

import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import { getErrorMessage } from '@/lib/errors';

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
      contacts.map(async (c: { id: string; name: string; phoneNumber: string }) => {
        const pauseInfo = await redisClient.getContactPauseInfo(c.id);
        return {
          ...c,
          isPaused: isGlobalPaused || (await redisClient.isContactPaused(c.id)),
          pausedAt: pauseInfo?.pausedAt ?? null,
          pauseReason: pauseInfo?.reason ?? null,
        };
      })
    );

    return NextResponse.json({ contacts: enriched });
  } catch (error) {
    console.error('[Contacts API] Error fetching contacts:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
