/**
 * ContactLinker Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContactLinker, type ContactLinkerDeps } from '../contact-linker.js';

// Mock Redis client
function createMockRedis() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) || null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      const had = store.has(key);
      store.delete(key);
      return had ? 1 : 0;
    }),
    mget: vi.fn(async (keys: string[]) => keys.map((k) => store.get(k) || null)),
    scan: vi.fn(async () => ['0', Array.from(store.keys())]),
    pipeline: vi.fn(() => {
      const ops: Array<{ method: string; args: string[] }> = [];
      const pipelineObj = {
        set: (key: string, value: string) => {
          ops.push({ method: 'set', args: [key, value] });
          return pipelineObj;
        },
        del: (key: string) => {
          ops.push({ method: 'del', args: [key] });
          return pipelineObj;
        },
        exec: async () => {
          for (const op of ops) {
            if (op.method === 'set') {
              store.set(op.args[0], op.args[1]);
            } else if (op.method === 'del') {
              store.delete(op.args[0]);
            }
          }
          return ops.map(() => [null, 'OK']);
        },
      };
      return pipelineObj;
    }),
    _store: store, // Expose for testing
  };
}

// Mock pairing store
function createMockPairingStore() {
  const approved = new Map<string, { tier: 'trusted' | 'standard' | 'restricted' }>();

  return {
    isApproved: vi.fn(async (contactId: string) => approved.has(contactId)),
    getApprovedContact: vi.fn(async (contactId: string) => approved.get(contactId) || null),
    _approve: (contactId: string, tier: 'trusted' | 'standard' | 'restricted' = 'standard') => {
      approved.set(contactId, { tier });
    },
    _clear: () => approved.clear(),
  };
}

describe('ContactLinker', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let pairingStore: ReturnType<typeof createMockPairingStore>;
  let linker: ContactLinker;

  beforeEach(() => {
    redis = createMockRedis();
    pairingStore = createMockPairingStore();
    linker = new ContactLinker({
      redis: redis as unknown as ContactLinkerDeps['redis'],
      pairingStore,
    });
  });

  describe('linkContact', () => {
    it('should create a new linked contact', async () => {
      const result = await linker.linkContact(
        'whatsapp',
        '1234567890@c.us',
        '+1234567890',
        'John Doe'
      );

      expect(result.normalizedPhone).toBe('+1234567890');
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0]).toEqual({
        channelId: 'whatsapp',
        contactId: '1234567890@c.us',
        displayName: 'John Doe',
      });
      expect(result.linkedAt).toBeGreaterThan(0);
    });

    it('should throw for invalid phone format missing +', async () => {
      await expect(
        linker.linkContact('whatsapp', '123@c.us', '1234567890')
      ).rejects.toThrow('Invalid phone number format');
    });

    it('should throw for phone with letters', async () => {
      await expect(
        linker.linkContact('whatsapp', '123@c.us', '+1234abc567')
      ).rejects.toThrow('Invalid phone number format');
    });

    it('should throw for phone starting with +0', async () => {
      await expect(
        linker.linkContact('whatsapp', '123@c.us', '+0123456789')
      ).rejects.toThrow('Invalid phone number format');
    });

    it('should accept valid E.164 phone', async () => {
      const result = await linker.linkContact('whatsapp', '123@c.us', '+1234567890');
      expect(result.normalizedPhone).toBe('+1234567890');
    });

    it('should add a new channel to existing linked contact', async () => {
      // Link WhatsApp first
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890', 'John Doe');

      // Link Telegram with same phone
      const result = await linker.linkContact('telegram', 'tg_123456', '+1234567890', 'John T');

      expect(result.channels).toHaveLength(2);
      expect(result.channels[0]).toEqual({
        channelId: 'whatsapp',
        contactId: '1234567890@c.us',
        displayName: 'John Doe',
      });
      expect(result.channels[1]).toEqual({
        channelId: 'telegram',
        contactId: 'tg_123456',
        displayName: 'John T',
      });
    });

    it('should update display name for existing channel entry', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890', 'John');
      const result = await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890', 'John Doe');

      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].displayName).toBe('John Doe');
    });
  });

  describe('getLinkedByPhone', () => {
    it('should return null for unlinked phone', async () => {
      const result = await linker.getLinkedByPhone('+1234567890');
      expect(result).toBeNull();
    });

    it('should return linked contact', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890');

      const result = await linker.getLinkedByPhone('+1234567890');
      expect(result).not.toBeNull();
      expect(result?.normalizedPhone).toBe('+1234567890');
    });
  });

  describe('getPhoneForContact', () => {
    it('should return null for unlinked contact', async () => {
      const result = await linker.getPhoneForContact('1234567890@c.us');
      expect(result).toBeNull();
    });

    it('should return phone number for linked contact', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890');

      const result = await linker.getPhoneForContact('1234567890@c.us');
      expect(result).toBe('+1234567890');
    });
  });

  describe('isApprovedAcrossChannels', () => {
    it('should return false for unlinked contact', async () => {
      const result = await linker.isApprovedAcrossChannels('1234567890@c.us');
      expect(result.approved).toBe(false);
    });

    it('should return false when no linked contacts are approved', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890');
      await linker.linkContact('telegram', 'tg_123456', '+1234567890');

      const result = await linker.isApprovedAcrossChannels('tg_123456', '+1234567890');
      expect(result.approved).toBe(false);
    });

    it('should return true when a linked contact is approved', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890');
      await linker.linkContact('telegram', 'tg_123456', '+1234567890');

      // Approve WhatsApp contact
      pairingStore._approve('1234567890@c.us', 'trusted');

      // Check from Telegram contact perspective
      const result = await linker.isApprovedAcrossChannels('tg_123456', '+1234567890');

      expect(result.approved).toBe(true);
      expect(result.tier).toBe('trusted');
      expect(result.approvedContactId).toBe('1234567890@c.us');
    });

    it('should skip the contact being checked', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890');

      // Only the checking contact is approved, no other linked contacts
      pairingStore._approve('1234567890@c.us', 'standard');

      // Should not find itself as an approved linked contact
      const result = await linker.isApprovedAcrossChannels('1234567890@c.us', '+1234567890');
      expect(result.approved).toBe(false);
    });

    it('should use phone lookup when normalizedPhone not provided', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890');
      await linker.linkContact('telegram', 'tg_123456', '+1234567890');
      pairingStore._approve('1234567890@c.us', 'standard');

      // Call without providing phone
      const result = await linker.isApprovedAcrossChannels('tg_123456');

      expect(result.approved).toBe(true);
    });
  });

  describe('getLinkedChannelsForContact', () => {
    it('should return empty array for unlinked contact', async () => {
      const result = await linker.getLinkedChannelsForContact('1234567890@c.us');
      expect(result).toEqual([]);
    });

    it('should return all linked channels', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890', 'John WA');
      await linker.linkContact('telegram', 'tg_123456', '+1234567890', 'John TG');

      const result = await linker.getLinkedChannelsForContact('1234567890@c.us');

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        channelId: 'whatsapp',
        contactId: '1234567890@c.us',
        displayName: 'John WA',
      });
      expect(result).toContainEqual({
        channelId: 'telegram',
        contactId: 'tg_123456',
        displayName: 'John TG',
      });
    });
  });

  describe('unlinkContact', () => {
    it('should return false for non-existent contact', async () => {
      const result = await linker.unlinkContact('unknown@c.us');
      expect(result).toBe(false);
    });

    it('should unlink a contact and preserve others', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890');
      await linker.linkContact('telegram', 'tg_123456', '+1234567890');

      const result = await linker.unlinkContact('1234567890@c.us');
      expect(result).toBe(true);

      // Telegram should still be linked
      const linked = await linker.getLinkedByPhone('+1234567890');
      expect(linked?.channels).toHaveLength(1);
      expect(linked?.channels[0].channelId).toBe('telegram');

      // WhatsApp reverse lookup should be gone
      const phone = await linker.getPhoneForContact('1234567890@c.us');
      expect(phone).toBeNull();
    });

    it('should delete phone key when last contact unlinked', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890');

      await linker.unlinkContact('1234567890@c.us');

      const linked = await linker.getLinkedByPhone('+1234567890');
      expect(linked).toBeNull();
    });
  });

  describe('listLinkedGroups', () => {
    it('should return empty array when no linked contacts', async () => {
      const result = await linker.listLinkedGroups();
      expect(result).toEqual([]);
    });

    it('should return all linked groups', async () => {
      await linker.linkContact('whatsapp', '1111111111@c.us', '+1111111111');
      await linker.linkContact('whatsapp', '2222222222@c.us', '+2222222222');

      const result = await linker.listLinkedGroups();
      expect(result).toHaveLength(2);
    });

    it('should respect limit', async () => {
      await linker.linkContact('whatsapp', '1111111111@c.us', '+1111111111');
      await linker.linkContact('whatsapp', '2222222222@c.us', '+2222222222');
      await linker.linkContact('whatsapp', '3333333333@c.us', '+3333333333');

      const result = await linker.listLinkedGroups(2);
      expect(result).toHaveLength(2);
    });
  });

  describe('getLinkedChannelsBatch', () => {
    it('should return empty map for empty input', async () => {
      const result = await linker.getLinkedChannelsBatch([]);
      expect(result.size).toBe(0);
    });

    it('should return empty channels for unlinked contacts', async () => {
      const result = await linker.getLinkedChannelsBatch(['unknown@c.us', 'unknown2@c.us']);
      expect(result.get('unknown@c.us')).toEqual([]);
      expect(result.get('unknown2@c.us')).toEqual([]);
    });

    it('should return linked channels for linked contacts', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890', 'John WA');
      await linker.linkContact('telegram', 'tg_123456', '+1234567890', 'John TG');

      const result = await linker.getLinkedChannelsBatch(['1234567890@c.us', 'tg_123456']);

      expect(result.get('1234567890@c.us')).toHaveLength(2);
      expect(result.get('tg_123456')).toHaveLength(2);
    });

    it('should handle mix of linked and unlinked contacts', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890', 'John');

      const result = await linker.getLinkedChannelsBatch([
        '1234567890@c.us',
        'unknown@c.us',
      ]);

      expect(result.get('1234567890@c.us')).toHaveLength(1);
      expect(result.get('unknown@c.us')).toEqual([]);
    });

    it('should dedupe phone lookups for same phone', async () => {
      await linker.linkContact('whatsapp', '1234567890@c.us', '+1234567890');
      await linker.linkContact('telegram', 'tg_123456', '+1234567890');

      const result = await linker.getLinkedChannelsBatch([
        '1234567890@c.us',
        'tg_123456',
      ]);

      // Both should have the same 2 channels
      expect(result.get('1234567890@c.us')).toHaveLength(2);
      expect(result.get('tg_123456')).toHaveLength(2);
    });
  });
});
