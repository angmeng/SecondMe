/**
 * Audit Logging Utilities
 *
 * Provides structured audit logging for security-sensitive operations.
 * Logs are output to stdout in JSON format for collection by log aggregators.
 */

interface AuditEvent {
  action: string;
  resource: string;
  resourceId?: string;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/**
 * Log an audit event in structured JSON format.
 * Events are prefixed with [AUDIT] for easy filtering.
 */
export function logAuditEvent(event: AuditEvent): void {
  const logEntry = {
    ...event,
    timestamp: event.timestamp.toISOString(),
  };

  // Log to stdout in structured format (can be collected by log aggregator)
  console.log('[AUDIT]', JSON.stringify(logEntry));
}

/**
 * Create an audit logger bound to a specific request.
 * Extracts IP and User-Agent from request headers.
 *
 * @param request - The incoming request
 * @returns A function to log audit events for this request
 */
export function createAuditLogger(request: Request) {
  return (
    action: string,
    resource: string,
    resourceId?: string,
    details?: Record<string, unknown>
  ) => {
    logAuditEvent({
      action,
      resource,
      resourceId,
      timestamp: new Date(),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      details,
    });
  };
}
