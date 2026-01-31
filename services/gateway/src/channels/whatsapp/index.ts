/**
 * WhatsApp Channel Module
 * Exports the WhatsApp channel adapter and utilities
 */

export {
  WhatsAppChannel,
  type WhatsAppChannelDeps,
  type WhatsAppChannelConfig,
} from './adapter.js';
export {
  normalizeWhatsAppContactId,
  isGroupChat,
  isStatusBroadcast,
  extractPhoneNumber,
} from './normalizer.js';
