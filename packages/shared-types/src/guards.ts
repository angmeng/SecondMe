/**
 * Runtime Type Guards
 * Validates data structures at runtime to catch malformed data from external sources
 */

import type { StoredMessage } from './history.js';
import type { PairingRequest, ApprovedContact, DeniedContact } from './pairing.js';

/**
 * Type guard for StoredMessage
 * Validates that an unknown object has the correct shape for StoredMessage
 *
 * Use this when parsing JSON from Redis or other external sources to ensure
 * data integrity before casting.
 *
 * @param obj - Unknown object to validate
 * @returns true if obj is a valid StoredMessage
 */
export function isStoredMessage(obj: unknown): obj is StoredMessage {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const msg = obj as Record<string, unknown>;

  return (
    typeof msg['id'] === 'string' &&
    (msg['role'] === 'user' || msg['role'] === 'assistant') &&
    typeof msg['content'] === 'string' &&
    typeof msg['timestamp'] === 'number' &&
    (msg['type'] === 'incoming' || msg['type'] === 'outgoing' || msg['type'] === 'fromMe')
  );
}

/**
 * Type guard for PairingRequest
 * Validates that an unknown object has the correct shape for PairingRequest
 *
 * @param obj - Unknown object to validate
 * @returns true if obj is a valid PairingRequest
 */
export function isPairingRequest(obj: unknown): obj is PairingRequest {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const req = obj as Record<string, unknown>;

  return (
    typeof req['contactId'] === 'string' &&
    typeof req['phoneNumber'] === 'string' &&
    typeof req['requestedAt'] === 'number' &&
    (req['status'] === 'pending' ||
      req['status'] === 'approved' ||
      req['status'] === 'denied' ||
      req['status'] === 'expired') &&
    // Optional fields
    (req['displayName'] === undefined || typeof req['displayName'] === 'string') &&
    (req['profilePicUrl'] === undefined || typeof req['profilePicUrl'] === 'string') &&
    (req['channelId'] === undefined || typeof req['channelId'] === 'string') &&
    (req['approvedBy'] === undefined || typeof req['approvedBy'] === 'string') &&
    (req['approvedAt'] === undefined || typeof req['approvedAt'] === 'number') &&
    (req['firstMessage'] === undefined || typeof req['firstMessage'] === 'string')
  );
}

/**
 * Type guard for ApprovedContact
 * Validates that an unknown object has the correct shape for ApprovedContact
 *
 * @param obj - Unknown object to validate
 * @returns true if obj is a valid ApprovedContact
 */
export function isApprovedContact(obj: unknown): obj is ApprovedContact {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const contact = obj as Record<string, unknown>;

  return (
    typeof contact['contactId'] === 'string' &&
    typeof contact['phoneNumber'] === 'string' &&
    typeof contact['approvedAt'] === 'number' &&
    typeof contact['approvedBy'] === 'string' &&
    (contact['tier'] === 'trusted' ||
      contact['tier'] === 'standard' ||
      contact['tier'] === 'restricted') &&
    // Optional fields
    (contact['displayName'] === undefined || typeof contact['displayName'] === 'string') &&
    (contact['profilePicUrl'] === undefined || typeof contact['profilePicUrl'] === 'string') &&
    (contact['channelId'] === undefined || typeof contact['channelId'] === 'string') &&
    (contact['notes'] === undefined || typeof contact['notes'] === 'string')
  );
}

/**
 * Type guard for DeniedContact
 * Validates that an unknown object has the correct shape for DeniedContact
 *
 * @param obj - Unknown object to validate
 * @returns true if obj is a valid DeniedContact
 */
export function isDeniedContact(obj: unknown): obj is DeniedContact {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const contact = obj as Record<string, unknown>;

  return (
    typeof contact['contactId'] === 'string' &&
    typeof contact['phoneNumber'] === 'string' &&
    typeof contact['deniedAt'] === 'number' &&
    typeof contact['deniedBy'] === 'string' &&
    typeof contact['expiresAt'] === 'number' &&
    // Optional fields
    (contact['displayName'] === undefined || typeof contact['displayName'] === 'string') &&
    (contact['reason'] === undefined || typeof contact['reason'] === 'string')
  );
}
