/**
 * Runtime Type Guards
 * Validates data structures at runtime to catch malformed data from external sources
 */

import type { StoredMessage } from './history.js';

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
