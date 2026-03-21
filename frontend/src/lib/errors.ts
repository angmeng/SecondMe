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

/**
 * Check if an error is a service connection failure (ECONNREFUSED / fetch failed)
 */
export function isConnectionError(error: unknown): boolean {
  const msg = getErrorMessage(error);
  return msg.includes('ECONNREFUSED') || msg.includes('fetch failed');
}

/**
 * Build a NextResponse-compatible error object for service proxy routes.
 * Returns { body, status } — caller wraps with NextResponse.json().
 */
export function serviceProxyError(
  error: unknown,
  context: string,
  serviceName: string,
  servicePort: number
): { body: Record<string, unknown>; status: number } {
  console.error(`[${context}] Error:`, error);

  if (isConnectionError(error)) {
    return {
      body: { error: `${serviceName} service unavailable. Ensure it is running on port ${servicePort}.` },
      status: 503,
    };
  }

  return {
    body: { error: getErrorMessage(error) },
    status: 500,
  };
}
