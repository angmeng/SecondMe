/**
 * Telegram Normalizer Tests
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeTelegramContactId,
  extractTelegramUserId,
  isTelegramContact,
  extractPhoneFromTelegramContact,
  isTelegramGroup,
} from '../telegram/normalizer.js';

describe('normalizeTelegramContactId', () => {
  it('normalizes numeric user ID', () => {
    expect(normalizeTelegramContactId(123456789)).toBe('tg_123456789');
  });

  it('normalizes string user ID', () => {
    expect(normalizeTelegramContactId('987654321')).toBe('tg_987654321');
  });

  it('handles large user IDs', () => {
    expect(normalizeTelegramContactId(1234567890123)).toBe('tg_1234567890123');
  });
});

describe('extractTelegramUserId', () => {
  it('extracts user ID from normalized format', () => {
    expect(extractTelegramUserId('tg_123456789')).toBe(123456789);
  });

  it('returns null for invalid format - no prefix', () => {
    expect(extractTelegramUserId('123456789')).toBeNull();
  });

  it('returns null for invalid format - wrong prefix', () => {
    expect(extractTelegramUserId('wa_123456789')).toBeNull();
  });

  it('returns null for invalid format - non-numeric', () => {
    expect(extractTelegramUserId('tg_abc')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractTelegramUserId('')).toBeNull();
  });

  it('handles large user IDs', () => {
    expect(extractTelegramUserId('tg_1234567890123')).toBe(1234567890123);
  });
});

describe('isTelegramContact', () => {
  it('returns true for valid Telegram contact ID', () => {
    expect(isTelegramContact('tg_123456789')).toBe(true);
  });

  it('returns false for WhatsApp contact ID', () => {
    expect(isTelegramContact('123456789@c.us')).toBe(false);
  });

  it('returns false for invalid format', () => {
    expect(isTelegramContact('telegram_123')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTelegramContact('')).toBe(false);
  });

  it('returns false for numeric-only string', () => {
    expect(isTelegramContact('123456789')).toBe(false);
  });
});

describe('extractPhoneFromTelegramContact', () => {
  it('extracts phone number from contact with country code', () => {
    expect(extractPhoneFromTelegramContact({ phone_number: '+1234567890' })).toBe('+1234567890');
  });

  it('adds + prefix if missing', () => {
    expect(extractPhoneFromTelegramContact({ phone_number: '1234567890' })).toBe('+1234567890');
  });

  it('removes non-digit characters', () => {
    expect(extractPhoneFromTelegramContact({ phone_number: '+1 (234) 567-8900' })).toBe(
      '+12345678900'
    );
  });

  it('returns null for empty phone number', () => {
    expect(extractPhoneFromTelegramContact({ phone_number: '' })).toBeNull();
  });

  it('returns null for null contact', () => {
    expect(extractPhoneFromTelegramContact(null)).toBeNull();
  });

  it('returns null for contact without phone_number', () => {
    expect(extractPhoneFromTelegramContact({})).toBeNull();
  });

  it('returns null for undefined phone_number', () => {
    expect(extractPhoneFromTelegramContact({ phone_number: undefined })).toBeNull();
  });
});

describe('isTelegramGroup', () => {
  it('returns true for group chat type', () => {
    expect(isTelegramGroup('group')).toBe(true);
  });

  it('returns true for supergroup chat type', () => {
    expect(isTelegramGroup('supergroup')).toBe(true);
  });

  it('returns false for private chat', () => {
    expect(isTelegramGroup('private')).toBe(false);
  });

  it('returns false for channel', () => {
    expect(isTelegramGroup('channel')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTelegramGroup('')).toBe(false);
  });
});
