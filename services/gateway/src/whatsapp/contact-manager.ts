/**
 * WhatsApp Contact Manager
 * Fetches and caches contacts from WhatsApp chats
 */

import { Client } from 'whatsapp-web.js';
import { redisClient } from '../redis/client.js';

export interface WhatsAppContact {
  id: string;           // e.g., "1234567890@c.us"
  name: string;         // pushname or number
  phoneNumber: string;  // just the number portion
}

export class ContactManager {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Fetch contacts from WhatsApp chats and cache them in Redis
   */
  async fetchAndCacheContacts(): Promise<WhatsAppContact[]> {
    console.log('[ContactManager] Fetching contacts from WhatsApp...');

    const chats = await this.client.getChats();

    // Filter to individual contacts only (not groups)
    const contacts: WhatsAppContact[] = chats
      .filter(chat => !chat.isGroup)
      .map(chat => ({
        id: chat.id._serialized,
        name: chat.name || chat.id.user,
        phoneNumber: chat.id.user,
      }));

    console.log(`[ContactManager] Found ${contacts.length} individual contacts`);

    await redisClient.cacheContacts(contacts);
    return contacts;
  }

  /**
   * Get contacts from cache, or fetch fresh if cache is empty
   */
  async getContacts(): Promise<WhatsAppContact[]> {
    const cached = await redisClient.getCachedContacts();
    if (cached) {
      console.log(`[ContactManager] Returning ${cached.length} cached contacts`);
      return cached;
    }
    return this.fetchAndCacheContacts();
  }
}
