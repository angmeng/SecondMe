/**
 * Channel-agnostic contact ID utilities
 *
 * Centralizes phone number extraction from platform-specific contact IDs
 * so that channel-agnostic code doesn't embed WhatsApp format knowledge.
 */

/**
 * Extract a phone number from a platform-specific contact ID.
 * Handles WhatsApp (@c.us, @s.whatsapp.net) and Telegram (tg_) formats.
 * Returns the raw contact ID if no platform suffix is recognized.
 */
export function extractPhoneFromContactId(contactId: string): string {
  // WhatsApp formats
  if (contactId.endsWith('@c.us') || contactId.endsWith('@s.whatsapp.net')) {
    return contactId.replace(/@(c\.us|s\.whatsapp\.net)$/, '');
  }

  // Telegram format (tg_{userId}) — not a phone number, return as-is
  if (contactId.startsWith('tg_')) {
    return contactId;
  }

  return contactId;
}
