/**
 * Telegram Contact ID Normalizer
 * Normalizes Telegram user IDs for the SecondMe multi-channel system.
 */

/**
 * Normalize Telegram user ID to SecondMe contact ID format
 *
 * Telegram users are identified by numeric IDs. This function creates
 * a prefixed format that can be used across the system.
 *
 * @param userId - Telegram numeric user ID
 * @returns Normalized contact ID in format 'tg_{userId}'
 */
export function normalizeTelegramContactId(userId: number | string): string {
  return `tg_${userId}`;
}

/**
 * Extract Telegram user ID from normalized contact ID
 *
 * @param contactId - Normalized contact ID (e.g., 'tg_123456')
 * @returns Telegram user ID as number, or null if invalid format
 */
export function extractTelegramUserId(contactId: string): number | null {
  const match = contactId.match(/^tg_(\d+)$/);
  if (!match || !match[1]) {
    return null;
  }
  return parseInt(match[1], 10);
}

/**
 * Check if a contact ID is a Telegram contact
 *
 * @param contactId - Contact ID to check
 * @returns true if this is a Telegram contact ID
 */
export function isTelegramContact(contactId: string): boolean {
  return /^tg_\d+$/.test(contactId);
}

/**
 * Extract phone from Telegram contact (only if user shared it)
 * Telegram users can optionally share their phone number with bots.
 *
 * @param contact - Telegram contact object with optional phone_number
 * @returns Phone number in E.164 format, or null if not available
 */
export function extractPhoneFromTelegramContact(
  contact: { phone_number?: string } | null
): string | null {
  if (!contact?.phone_number) return null;
  // Normalize to E.164 format
  const digits = contact.phone_number.replace(/\D/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/**
 * Check if message is from a group chat
 *
 * @param chatType - Telegram chat type string
 * @returns true if this is a group or supergroup
 */
export function isTelegramGroup(chatType: string): boolean {
  return chatType === 'group' || chatType === 'supergroup';
}
