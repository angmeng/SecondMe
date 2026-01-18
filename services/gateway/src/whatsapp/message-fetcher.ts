/**
 * Message Fetcher
 * Fetches chat message history from WhatsApp using whatsapp-web.js
 */

import pkg from 'whatsapp-web.js';
const { Client } = pkg;

export interface FetchedMessage {
  id: string;
  content: string;
  timestamp: number;
  sender: 'user' | 'contact';
  status: 'read';
  hasMedia: boolean;
}

/**
 * Fetch messages from a WhatsApp chat
 * @param client WhatsApp Web client instance
 * @param contactId WhatsApp contact ID (e.g., "1234567890@c.us")
 * @param limit Maximum number of messages to fetch (default 50)
 * @returns Array of messages sorted by timestamp (oldest first)
 */
export async function fetchChatMessages(
  client: InstanceType<typeof Client>,
  contactId: string,
  limit: number = 50
): Promise<FetchedMessage[]> {
  // Get the chat by ID
  const chat = await client.getChatById(contactId);

  // Fetch messages from the chat
  const messages = await chat.fetchMessages({ limit });

  // Map to our message format
  return messages.map((msg) => ({
    id: msg.id._serialized,
    content: msg.body,
    timestamp: msg.timestamp * 1000, // Convert to milliseconds
    sender: msg.fromMe ? 'user' : 'contact',
    status: 'read' as const,
    hasMedia: msg.hasMedia,
  }));
}
