/**
 * Messages API Route
 * Proxies message history requests to Gateway service
 */

import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env['GATEWAY_URL'] || 'http://localhost:3001';

/**
 * GET /api/contacts/[id]/messages - Fetch message history for a contact
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params;
    const limit = request.nextUrl.searchParams.get('limit') || '50';

    // Proxy to Gateway service
    const response = await fetch(
      `${GATEWAY_URL}/api/chats/${contactId}/messages?limit=${limit}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Messages API] Error fetching messages:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch messages',
        messages: [],
      },
      { status: 500 }
    );
  }
}
