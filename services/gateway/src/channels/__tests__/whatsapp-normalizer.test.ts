/**
 * WhatsApp Normalizer Tests
 * Unit tests for contact ID normalization functions
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeWhatsAppContactId,
  isGroupChat,
  isStatusBroadcast,
  extractPhoneNumber,
} from '../whatsapp/normalizer.js';

describe('normalizeWhatsAppContactId', () => {
  describe('valid individual contacts', () => {
    it('should normalize @c.us format to phone number with +', () => {
      expect(normalizeWhatsAppContactId('1234567890@c.us')).toBe('+1234567890');
    });

    it('should normalize @s.whatsapp.net format to phone number with +', () => {
      expect(normalizeWhatsAppContactId('1234567890@s.whatsapp.net')).toBe('+1234567890');
    });

    it('should handle international numbers with country codes', () => {
      expect(normalizeWhatsAppContactId('12025551234@c.us')).toBe('+12025551234');
      expect(normalizeWhatsAppContactId('447911123456@c.us')).toBe('+447911123456');
      expect(normalizeWhatsAppContactId('5511999998888@c.us')).toBe('+5511999998888');
    });

    it('should handle short numbers', () => {
      expect(normalizeWhatsAppContactId('123@c.us')).toBe('+123');
    });
  });

  describe('invalid or non-individual contacts', () => {
    it('should return null for group chats', () => {
      expect(normalizeWhatsAppContactId('120363123456789@g.us')).toBeNull();
    });

    it('should return null for status broadcast', () => {
      expect(normalizeWhatsAppContactId('status@broadcast')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(normalizeWhatsAppContactId('')).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(normalizeWhatsAppContactId(undefined as unknown as string)).toBeNull();
    });

    it('should return null for null', () => {
      expect(normalizeWhatsAppContactId(null as unknown as string)).toBeNull();
    });

    it('should return null for non-string types', () => {
      expect(normalizeWhatsAppContactId(12345 as unknown as string)).toBeNull();
      expect(normalizeWhatsAppContactId({} as unknown as string)).toBeNull();
    });

    it('should return null for invalid format without @', () => {
      expect(normalizeWhatsAppContactId('1234567890')).toBeNull();
    });

    it('should return null for invalid format with wrong suffix', () => {
      expect(normalizeWhatsAppContactId('1234567890@invalid.com')).toBeNull();
    });

    it('should return null for non-numeric prefix', () => {
      expect(normalizeWhatsAppContactId('abc123@c.us')).toBeNull();
    });
  });
});

describe('isGroupChat', () => {
  it('should return true for group chat IDs', () => {
    expect(isGroupChat('120363123456789@g.us')).toBe(true);
    expect(isGroupChat('some-group-id@g.us')).toBe(true);
  });

  it('should return false for individual chats', () => {
    expect(isGroupChat('1234567890@c.us')).toBe(false);
    expect(isGroupChat('1234567890@s.whatsapp.net')).toBe(false);
  });

  it('should return false for status broadcast', () => {
    expect(isGroupChat('status@broadcast')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isGroupChat('')).toBe(false);
  });

  it('should return false for invalid inputs', () => {
    expect(isGroupChat(undefined as unknown as string)).toBe(false);
    expect(isGroupChat(null as unknown as string)).toBe(false);
  });
});

describe('isStatusBroadcast', () => {
  it('should return true for status broadcast', () => {
    expect(isStatusBroadcast('status@broadcast')).toBe(true);
  });

  it('should return false for individual chats', () => {
    expect(isStatusBroadcast('1234567890@c.us')).toBe(false);
  });

  it('should return false for group chats', () => {
    expect(isStatusBroadcast('120363123456789@g.us')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isStatusBroadcast('')).toBe(false);
  });

  it('should return false for invalid inputs', () => {
    expect(isStatusBroadcast(undefined as unknown as string)).toBe(false);
    expect(isStatusBroadcast(null as unknown as string)).toBe(false);
  });
});

describe('extractPhoneNumber', () => {
  it('should extract phone number without + prefix', () => {
    expect(extractPhoneNumber('1234567890@c.us')).toBe('1234567890');
    expect(extractPhoneNumber('447911123456@s.whatsapp.net')).toBe('447911123456');
  });

  it('should return null for group chats', () => {
    expect(extractPhoneNumber('120363123456789@g.us')).toBeNull();
  });

  it('should return null for status broadcast', () => {
    expect(extractPhoneNumber('status@broadcast')).toBeNull();
  });

  it('should return null for invalid inputs', () => {
    expect(extractPhoneNumber('')).toBeNull();
    expect(extractPhoneNumber('invalid')).toBeNull();
  });
});
