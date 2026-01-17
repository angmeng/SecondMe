/**
 * Contacts Refresh API Route
 * Triggers a re-fetch of WhatsApp contacts from the Gateway
 */

import { NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';

/**
 * POST /api/contacts/refresh - Trigger contacts re-fetch from WhatsApp
 */
export async function POST() {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/contacts/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to refresh contacts' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[Contacts Refresh API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to connect to Gateway' },
      { status: 500 }
    );
  }
}
