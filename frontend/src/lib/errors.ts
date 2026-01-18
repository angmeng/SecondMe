/**
 * Error Handling Utilities
 * Type-safe error handling for catch blocks and API responses
 */

/**
 * Extract a human-readable message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

/**
 * Log and format an error for API responses
 */
export function handleApiError(context: string, error: unknown): string {
  const message = getErrorMessage(error);
  console.error(`[${context}] Error:`, error);
  return message;
}
