/**
 * Telegram Channel Module
 * Exports Telegram channel adapter and utilities
 */

export { TelegramChannel } from './adapter.js';
export type { TelegramChannelConfig, TelegramChannelDeps } from './adapter.js';
export {
  normalizeTelegramContactId,
  extractTelegramUserId,
  isTelegramContact,
  extractPhoneFromTelegramContact,
  isTelegramGroup,
} from './normalizer.js';
