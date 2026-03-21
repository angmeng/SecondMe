/**
 * Channel utility helpers
 * Shared utilities for channel adapter implementations.
 */

/**
 * Extract a human-readable message from any thrown value.
 * Handles Error instances, plain strings, and arbitrary unknown values.
 *
 * @param error - Value caught from a try/catch block
 * @returns String representation suitable for logging
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
