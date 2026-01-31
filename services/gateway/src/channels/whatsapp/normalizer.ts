/**
 * WhatsApp Contact ID Normalizer
 * Extracts normalized phone numbers from WhatsApp-specific contact IDs
 * for cross-channel contact linking.
 */

/**
 * Normalize WhatsApp contact ID to phone number
 *
 * WhatsApp contact IDs come in several formats:
 * - Individual: '1234567890@c.us' (common format)
 * - Individual: '1234567890@s.whatsapp.net' (alternative format)
 * - Group: 'groupid@g.us' (no phone number)
 * - Status: 'status@broadcast' (no phone number)
 *
 * @param contactId - WhatsApp format contact ID
 * @returns Phone number with + prefix (e.g., '+1234567890'), or null if invalid/no phone
 */
export function normalizeWhatsAppContactId(contactId: string): string | null {
  if (!contactId || typeof contactId !== 'string') {
    return null;
  }

  // Individual chat: number@c.us
  const cusMatch = contactId.match(/^(\d+)@c\.us$/);
  if (cusMatch) {
    return `+${cusMatch[1]}`;
  }

  // Alternative format: number@s.whatsapp.net
  const snetMatch = contactId.match(/^(\d+)@s\.whatsapp\.net$/);
  if (snetMatch) {
    return `+${snetMatch[1]}`;
  }

  // Group chats, status broadcasts, etc. don't have a single phone number
  return null;
}

/**
 * Check if contact ID represents a group chat
 *
 * @param contactId - WhatsApp format contact ID
 * @returns true if this is a group chat
 */
export function isGroupChat(contactId: string): boolean {
  if (!contactId || typeof contactId !== 'string') {
    return false;
  }
  return contactId.endsWith('@g.us');
}

/**
 * Check if contact ID represents a status broadcast
 *
 * @param contactId - WhatsApp format contact ID
 * @returns true if this is a status broadcast
 */
export function isStatusBroadcast(contactId: string): boolean {
  if (!contactId || typeof contactId !== 'string') {
    return false;
  }
  return contactId === 'status@broadcast';
}

/**
 * Extract raw phone number (without +) from WhatsApp contact ID
 * Useful when you need just the digits
 *
 * @param contactId - WhatsApp format contact ID
 * @returns Phone number digits only, or null if invalid
 */
export function extractPhoneNumber(contactId: string): string | null {
  const normalized = normalizeWhatsAppContactId(contactId);
  if (normalized) {
    return normalized.slice(1); // Remove the '+'
  }
  return null;
}
