/**
 * Contact Linker
 * Links contacts across messaging channels by normalized phone number
 *
 * Redis Keys:
 * - LINKED:phone:{normalizedPhone} - StoredLinkedContact JSON (no TTL)
 * - LINKED:contact:{contactId} - normalizedPhone string (no TTL)
 */

import type { Redis } from 'ioredis';
import type {
  ChannelId,
  StoredLinkedContact,
  LinkedContact,
  ContactTier,
} from '@secondme/shared-types';
import { isStoredLinkedContact } from '@secondme/shared-types';

/**
 * Interface for pairing store operations needed by ContactLinker
 */
export interface ContactLinkerPairingStore {
  isApproved(contactId: string): Promise<boolean>;
  getApprovedContact(contactId: string): Promise<{ tier: ContactTier } | null>;
}

/**
 * Dependencies for ContactLinker
 */
export interface ContactLinkerDeps {
  redis: Redis;
  pairingStore: ContactLinkerPairingStore;
}

/**
 * Result of checking approval across linked channels
 */
export interface LinkedApprovalResult {
  approved: boolean;
  tier?: ContactTier;
  approvedContactId?: string;
}

/**
 * Redis key helpers
 */
const KEYS = {
  phone: (normalizedPhone: string) => `LINKED:phone:${normalizedPhone}`,
  contact: (contactId: string) => `LINKED:contact:${contactId}`,
};

/**
 * E.164 phone number validation regex
 * Format: +[country code][subscriber number], 1-15 digits after +
 */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Validate that a phone number is in E.164 format
 */
function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone);
}

/**
 * ContactLinker class
 * Manages cross-channel contact linking by phone number
 */
export class ContactLinker {
  private deps: ContactLinkerDeps;

  constructor(deps: ContactLinkerDeps) {
    this.deps = deps;
  }

  /**
   * Link a contact to its phone number
   * Auto-called when processing a message with a normalizedContactId
   *
   * @param channelId - The channel the contact is on
   * @param contactId - The channel-specific contact ID
   * @param normalizedPhone - The normalized phone number (E.164 format)
   * @param displayName - Optional display name
   * @returns The updated StoredLinkedContact
   */
  async linkContact(
    channelId: ChannelId,
    contactId: string,
    normalizedPhone: string,
    displayName?: string
  ): Promise<StoredLinkedContact> {
    // Validate E.164 phone format
    if (!isValidE164(normalizedPhone)) {
      throw new Error(
        `Invalid phone number format: ${normalizedPhone}. Expected E.164 format (e.g., +1234567890)`
      );
    }

    const now = Date.now();

    // Get existing linked contact or create new one
    let linked = await this.getLinkedByPhone(normalizedPhone);

    if (linked) {
      // Update existing: find or add this channel's entry
      const existingIndex = linked.channels.findIndex(
        (c) => c.channelId === channelId && c.contactId === contactId
      );

      if (existingIndex >= 0) {
        // Update display name if provided
        if (displayName) {
          linked.channels[existingIndex].displayName = displayName;
        }
      } else {
        // Add new channel entry
        linked.channels.push({
          channelId,
          contactId,
          displayName,
        });
      }

      // Update last activity
      linked.lastActivity = now;
    } else {
      // Create new linked contact
      linked = {
        normalizedPhone,
        channels: [
          {
            channelId,
            contactId,
            displayName,
          },
        ],
        linkedAt: now,
        lastActivity: now,
      };
    }

    // Save both keys atomically using a pipeline
    const pipeline = this.deps.redis.pipeline();
    pipeline.set(KEYS.phone(normalizedPhone), JSON.stringify(linked));
    pipeline.set(KEYS.contact(contactId), normalizedPhone);
    await pipeline.exec();

    return linked;
  }

  /**
   * Get linked contact by phone number
   *
   * @param normalizedPhone - The normalized phone number
   * @returns StoredLinkedContact or null if not found
   */
  async getLinkedByPhone(normalizedPhone: string): Promise<StoredLinkedContact | null> {
    const json = await this.deps.redis.get(KEYS.phone(normalizedPhone));
    if (!json) return null;

    try {
      const parsed: unknown = JSON.parse(json);
      if (isStoredLinkedContact(parsed)) {
        return parsed;
      }
      console.error(`[ContactLinker] Invalid linked contact structure for phone ${normalizedPhone}`);
      return null;
    } catch (error) {
      console.error(`[ContactLinker] Error parsing linked contact for phone ${normalizedPhone}:`, error);
      return null;
    }
  }

  /**
   * Reverse lookup: get phone number for a contact ID
   *
   * @param contactId - The channel-specific contact ID
   * @returns The normalized phone number or null if not linked
   */
  async getPhoneForContact(contactId: string): Promise<string | null> {
    return this.deps.redis.get(KEYS.contact(contactId));
  }

  /**
   * Check if ANY linked contact is approved
   * Used by message processor to determine if a new channel contact
   * should be auto-approved based on an existing linked contact
   *
   * @param contactId - The contact ID to check
   * @param normalizedPhone - Optional phone number (if already known)
   * @returns Approval result with tier and approved contact ID if found
   */
  async isApprovedAcrossChannels(
    contactId: string,
    normalizedPhone?: string | null
  ): Promise<LinkedApprovalResult> {
    // Get phone number if not provided
    const phone = normalizedPhone || (await this.getPhoneForContact(contactId));
    if (!phone) {
      return { approved: false };
    }

    // Get all linked channels
    const linked = await this.getLinkedByPhone(phone);
    if (!linked || linked.channels.length === 0) {
      return { approved: false };
    }

    // Check each linked contact for approval
    for (const channel of linked.channels) {
      // Skip the contact we're checking (they're already not approved)
      if (channel.contactId === contactId) continue;

      const isApproved = await this.deps.pairingStore.isApproved(channel.contactId);
      if (isApproved) {
        const approved = await this.deps.pairingStore.getApprovedContact(channel.contactId);
        return {
          approved: true,
          tier: approved?.tier,
          approvedContactId: channel.contactId,
        };
      }
    }

    return { approved: false };
  }

  /**
   * Get all linked channels for a contact
   * Used by dashboard API to display linked channels
   *
   * @param contactId - The contact ID to look up
   * @returns Array of linked channel entries (may be empty)
   */
  async getLinkedChannelsForContact(contactId: string): Promise<LinkedContact['channels']> {
    const phone = await this.getPhoneForContact(contactId);
    if (!phone) {
      return [];
    }

    const linked = await this.getLinkedByPhone(phone);
    if (!linked) {
      return [];
    }

    return linked.channels;
  }

  /**
   * Batch get linked channels for multiple contacts
   * Uses Redis mget for efficiency to reduce N+1 queries
   *
   * @param contactIds - Array of contact IDs to look up
   * @returns Map of contactId to their linked channels
   */
  async getLinkedChannelsBatch(
    contactIds: string[]
  ): Promise<Map<string, LinkedContact['channels']>> {
    const result = new Map<string, LinkedContact['channels']>();
    if (contactIds.length === 0) return result;

    // Step 1: Get all phone numbers in batch
    const phoneResults = await this.deps.redis.mget(
      contactIds.map((id) => KEYS.contact(id))
    );

    // Collect unique phones that exist
    const phoneToContactIds = new Map<string, string[]>();
    for (let i = 0; i < contactIds.length; i++) {
      const phone = phoneResults[i];
      const contactId = contactIds[i]!; // Safe: within bounds
      if (phone) {
        const existing = phoneToContactIds.get(phone) || [];
        existing.push(contactId);
        phoneToContactIds.set(phone, existing);
      } else {
        result.set(contactId, []);
      }
    }

    if (phoneToContactIds.size === 0) return result;

    // Step 2: Get all linked contact records in batch
    const phones = Array.from(phoneToContactIds.keys());
    const linkedResults = await this.deps.redis.mget(phones.map((p) => KEYS.phone(p)));

    // Map results back to contact IDs
    for (let i = 0; i < phones.length; i++) {
      const json = linkedResults[i];
      const phone = phones[i]!; // Safe: within bounds
      const contactIdsForPhone = phoneToContactIds.get(phone) || [];

      if (json) {
        try {
          const parsed: unknown = JSON.parse(json);
          if (isStoredLinkedContact(parsed)) {
            for (const contactId of contactIdsForPhone) {
              result.set(contactId, parsed.channels);
            }
          } else {
            for (const contactId of contactIdsForPhone) {
              result.set(contactId, []);
            }
          }
        } catch {
          for (const contactId of contactIdsForPhone) {
            result.set(contactId, []);
          }
        }
      } else {
        for (const contactId of contactIdsForPhone) {
          result.set(contactId, []);
        }
      }
    }

    return result;
  }

  /**
   * List all linked groups (for debugging/admin)
   *
   * @param limit - Maximum number of groups to return
   * @returns Array of StoredLinkedContact
   */
  async listLinkedGroups(limit: number = 100): Promise<StoredLinkedContact[]> {
    const groups: StoredLinkedContact[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.deps.redis.scan(
        cursor,
        'MATCH',
        'LINKED:phone:*',
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await this.deps.redis.mget(keys);
        for (const json of values) {
          if (json) {
            try {
              const parsed: unknown = JSON.parse(json);
              if (isStoredLinkedContact(parsed)) {
                groups.push(parsed);
              }
            } catch {
              // Skip invalid entries
            }
          }
        }
      }

      if (groups.length >= limit) break;
    } while (cursor !== '0');

    // Sort by linkedAt descending (newest first)
    return groups.slice(0, limit).sort((a, b) => b.linkedAt - a.linkedAt);
  }

  /**
   * Unlink a contact from its phone number
   * Removes the contact from the linked group but preserves other channels
   *
   * @param contactId - The contact ID to unlink
   * @returns Whether the contact was unlinked
   */
  async unlinkContact(contactId: string): Promise<boolean> {
    const phone = await this.getPhoneForContact(contactId);
    if (!phone) {
      return false;
    }

    const linked = await this.getLinkedByPhone(phone);
    if (!linked) {
      // Just delete the reverse lookup key
      await this.deps.redis.del(KEYS.contact(contactId));
      return true;
    }

    // Remove this contact from the channels array
    linked.channels = linked.channels.filter((c) => c.contactId !== contactId);

    const pipeline = this.deps.redis.pipeline();

    // Delete reverse lookup
    pipeline.del(KEYS.contact(contactId));

    if (linked.channels.length === 0) {
      // No more channels, delete the phone key too
      pipeline.del(KEYS.phone(phone));
    } else {
      // Update the phone key with remaining channels
      pipeline.set(KEYS.phone(phone), JSON.stringify(linked));
    }

    await pipeline.exec();
    return true;
  }
}
