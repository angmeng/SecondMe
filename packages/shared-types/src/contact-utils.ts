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

/**
 * Mask a contact ID for privacy in logs.
 * Shows first 4 and last 2 characters of the identifier portion.
 * Example: '1234567890@c.us' -> '1234****90@c.us'
 * Example: 'tg_123456789' -> 'tg_1****89'
 */
export function maskContactId(contactId: string): string {
  const atIndex = contactId.indexOf('@');
  if (atIndex > 0) {
    const phone = contactId.slice(0, atIndex);
    const suffix = contactId.slice(atIndex);
    if (phone.length <= 6) return contactId;
    return phone.slice(0, 4) + '****' + phone.slice(-2) + suffix;
  }
  if (contactId.length <= 6) return contactId;
  return contactId.slice(0, 4) + '****' + contactId.slice(-2);
}
