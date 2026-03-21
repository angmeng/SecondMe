/**
 * Shared Pairing Operations
 *
 * Standalone async functions for CRUD operations on pairing Redis state.
 * Both the Gateway (pairing-store.ts) and the Frontend (redis-client.ts)
 * use identical SCAN+MGET+parse+sort patterns — this module is the single
 * source of truth for those operations.
 *
 * Design constraints:
 * - Accepts a minimal Redis interface so both ioredis (frontend) and the
 *   gateway's ioredis client satisfy the contract without casting.
 * - Uses the shared type guards (isPairingRequest, isApprovedContact) so
 *   every consumer gets the same validation behaviour (fixes L4).
 * - Key strings are generated exclusively via PAIRING_KEYS (fixes L3).
 */

import type { PairingRequest, ApprovedContact, DeniedContact, ContactTier } from './pairing.js';
import { isPairingRequest, isApprovedContact } from './guards.js';
import { extractPhoneFromContactId } from './contact-utils.js';

// ─── Redis key helpers (single source of truth for key strings) ──────────────

/**
 * Redis key generators for all pairing-related keys.
 * Mirrors the private KEYS object in the gateway's PairingStore and replaces
 * the raw string literals previously used in the frontend.
 */
export const PAIRING_KEYS = {
  pending: (contactId: string): string => `PAIRING:pending:${contactId}`,
  approved: (contactId: string): string => `PAIRING:approved:${contactId}`,
  denied: (contactId: string): string => `PAIRING:denied:${contactId}`,
} as const;

// ─── Minimal Redis interface ──────────────────────────────────────────────────

/**
 * The subset of the ioredis Redis client API that the shared pairing
 * operations require.  Both the gateway's ioredis instance and the
 * frontend's ioredis instance implement this interface, so neither
 * consumer needs a cast.
 */
export interface PairingRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  exists(...keys: string[]): Promise<number>;
  scan(
    cursor: string,
    matchOption: 'MATCH',
    pattern: string,
    countOption: 'COUNT',
    count: number
  ): Promise<[string, string[]]>;
  mget(keys: string[]): Promise<Array<string | null>>;
}

// ─── Shared CRUD operations ───────────────────────────────────────────────────

/**
 * List all pending pairing requests up to `limit`.
 * Uses SCAN+MGET to avoid blocking the Redis event loop.
 * Results are sorted by requestedAt descending (newest first).
 */
export async function listPendingRequests(
  redis: PairingRedisClient,
  limit: number = 100
): Promise<PairingRequest[]> {
  const requests: PairingRequest[] = [];
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'PAIRING:pending:*', 'COUNT', 100);
    cursor = nextCursor;

    if (keys.length > 0) {
      const values = await redis.mget(keys);
      for (const json of values) {
        if (json) {
          try {
            const parsed: unknown = JSON.parse(json);
            if (isPairingRequest(parsed)) {
              requests.push(parsed);
            }
          } catch {
            // Skip malformed entries
          }
        }
      }
    }

    if (requests.length >= limit) break;
  } while (cursor !== '0');

  return requests.slice(0, limit).sort((a, b) => b.requestedAt - a.requestedAt);
}

/**
 * List all approved contacts up to `limit`.
 * Uses SCAN+MGET to avoid blocking the Redis event loop.
 * Results are sorted by approvedAt descending (newest first).
 */
export async function listApprovedContacts(
  redis: PairingRedisClient,
  limit: number = 1000
): Promise<ApprovedContact[]> {
  const contacts: ApprovedContact[] = [];
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      'PAIRING:approved:*',
      'COUNT',
      100
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      const values = await redis.mget(keys);
      for (const json of values) {
        if (json) {
          try {
            const parsed: unknown = JSON.parse(json);
            if (isApprovedContact(parsed)) {
              contacts.push(parsed);
            }
          } catch {
            // Skip malformed entries
          }
        }
      }
    }

    if (contacts.length >= limit) break;
  } while (cursor !== '0');

  return contacts.slice(0, limit).sort((a, b) => b.approvedAt - a.approvedAt);
}

/**
 * Retrieve a single pending pairing request by contactId.
 * Returns null when the key is absent or the stored value fails validation.
 */
export async function getPendingRequest(
  redis: PairingRedisClient,
  contactId: string
): Promise<PairingRequest | null> {
  const json = await redis.get(PAIRING_KEYS.pending(contactId));
  if (!json) return null;

  try {
    const parsed: unknown = JSON.parse(json);
    if (isPairingRequest(parsed)) {
      return parsed;
    }
    console.error(`[pairing-ops] Invalid pending request structure for ${contactId}`);
    return null;
  } catch (error) {
    console.error(`[pairing-ops] Error parsing pending request for ${contactId}:`, error);
    return null;
  }
}

/**
 * Retrieve a single approved contact record by contactId.
 * Returns null when the key is absent or the stored value fails validation.
 */
export async function getApprovedContact(
  redis: PairingRedisClient,
  contactId: string
): Promise<ApprovedContact | null> {
  const json = await redis.get(PAIRING_KEYS.approved(contactId));
  if (!json) return null;

  try {
    const parsed: unknown = JSON.parse(json);
    if (isApprovedContact(parsed)) {
      return parsed;
    }
    console.error(`[pairing-ops] Invalid approved contact structure for ${contactId}`);
    return null;
  } catch (error) {
    console.error(`[pairing-ops] Error parsing approved contact for ${contactId}:`, error);
    return null;
  }
}

/**
 * Approve a contact (non-atomic SET + DEL).
 *
 * This implementation is intentionally non-atomic and is suitable for
 * callers that do not need Lua-script guarantees (e.g. the frontend's
 * dashboard API routes).  The gateway's PairingStore uses a Lua script
 * for atomic approval and should not delegate to this function.
 *
 * Preserves contact metadata from any existing pending request.
 */
export async function approveContact(
  redis: PairingRedisClient,
  contactId: string,
  approvedBy: string,
  tier: ContactTier = 'standard',
  notes?: string
): Promise<ApprovedContact> {
  const pending = await getPendingRequest(redis, contactId);

  const now = Date.now();
  const approved: ApprovedContact = {
    contactId,
    phoneNumber: pending?.phoneNumber ?? extractPhoneFromContactId(contactId),
    ...(pending?.displayName !== undefined && { displayName: pending.displayName }),
    ...(pending?.profilePicUrl !== undefined && { profilePicUrl: pending.profilePicUrl }),
    ...(pending?.channelId !== undefined && { channelId: pending.channelId }),
    approvedAt: now,
    approvedBy,
    tier,
    ...(notes !== undefined && { notes }),
  };

  await redis.set(PAIRING_KEYS.approved(contactId), JSON.stringify(approved));

  if (pending) {
    await redis.del(PAIRING_KEYS.pending(contactId));
  }

  return approved;
}

/**
 * Deny a contact (non-atomic SETEX + DEL).
 *
 * Like approveContact above, this is non-atomic and is intended for
 * the frontend dashboard.  The gateway uses a Lua script instead.
 */
export async function denyContact(
  redis: PairingRedisClient,
  contactId: string,
  deniedBy: string,
  reason?: string,
  cooldownHours: number = 24
): Promise<void> {
  const pending = await getPendingRequest(redis, contactId);

  const now = Date.now();
  const expiresAt = now + cooldownHours * 60 * 60 * 1000;
  const ttlSeconds = cooldownHours * 60 * 60;

  const denied: DeniedContact = {
    contactId,
    phoneNumber: pending?.phoneNumber ?? extractPhoneFromContactId(contactId),
    ...(pending?.displayName !== undefined && { displayName: pending.displayName }),
    deniedAt: now,
    deniedBy,
    ...(reason !== undefined && { reason }),
    expiresAt,
  };

  await redis.setex(PAIRING_KEYS.denied(contactId), ttlSeconds, JSON.stringify(denied));

  if (pending) {
    await redis.del(PAIRING_KEYS.pending(contactId));
  }
}

/**
 * Revoke an approved contact's access by deleting the approved key.
 */
export async function revokeApproval(
  redis: PairingRedisClient,
  contactId: string
): Promise<void> {
  await redis.del(PAIRING_KEYS.approved(contactId));
}

/**
 * Update the tier on an existing approved contact record.
 * Returns the updated record, or null if the contact is not found.
 */
export async function updateContactTier(
  redis: PairingRedisClient,
  contactId: string,
  tier: ContactTier
): Promise<ApprovedContact | null> {
  const contact = await getApprovedContact(redis, contactId);
  if (!contact) return null;

  contact.tier = tier;
  await redis.set(PAIRING_KEYS.approved(contactId), JSON.stringify(contact));

  return contact;
}
