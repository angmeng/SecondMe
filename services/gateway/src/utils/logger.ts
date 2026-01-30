/**
 * Logger Utility
 * T116: Structured logging with winston for error handling and debugging
 * Extended with security event logging for pairing and content analysis
 */

import winston from 'winston';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import type { SecurityEventType, SecuritySeverity } from '@secondme/shared-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NODE_ENV = process.env['NODE_ENV'] || 'development';
const LOG_LEVEL = process.env['LOG_LEVEL'] || (NODE_ENV === 'production' ? 'info' : 'debug');

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${service || 'Gateway'}] ${level}: ${message}${metaStr}`;
  })
);

// JSON format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports: winston.transport[] = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// Logs directory for file transports
const logsDir = resolve(__dirname, '../../../../logs');

// Add file transports in production
if (NODE_ENV === 'production') {
  transports.push(
    // Error log
    new winston.transports.File({
      filename: resolve(logsDir, 'gateway-error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Combined log
    new winston.transports.File({
      filename: resolve(logsDir, 'gateway-combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Security event log transport (always enabled)
// Logs security-relevant events to a separate file for audit trails
const securityTransport = new winston.transports.File({
  filename: resolve(logsDir, 'security.jsonl'),
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  maxsize: 10 * 1024 * 1024, // 10MB
  maxFiles: 30, // Keep 30 days
  tailable: true,
});

// Add security transport to the transports array
transports.push(securityTransport);

// Create logger instance
const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { service: 'Gateway' },
  transports,
  // Handle uncaught exceptions
  exceptionHandlers: NODE_ENV === 'production' ? [
    new winston.transports.File({
      filename: resolve(__dirname, '../../../../logs/gateway-exceptions.log'),
    }),
  ] : undefined,
  // Handle unhandled rejections
  rejectionHandlers: NODE_ENV === 'production' ? [
    new winston.transports.File({
      filename: resolve(__dirname, '../../../../logs/gateway-rejections.log'),
    }),
  ] : undefined,
});

// Create child loggers for different components
export function createLogger(component: string) {
  return logger.child({ component });
}

// Structured error logging helper
export function logError(
  logger: winston.Logger,
  message: string,
  error: unknown,
  context?: Record<string, unknown>
) {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  logger.error(message, {
    error: {
      name: errorObj.name,
      message: errorObj.message,
      stack: errorObj.stack,
    },
    ...context,
  });
}

// WhatsApp event logging helper
export function logWhatsAppEvent(
  event: string,
  contactId?: string,
  details?: Record<string, unknown>
) {
  logger.info(`WhatsApp: ${event}`, {
    contactId,
    ...details,
  });
}

// Message routing logging helper
export function logMessageRouting(
  messageId: string,
  contactId: string,
  direction: 'incoming' | 'outgoing',
  details?: Record<string, unknown>
) {
  logger.info(`Message ${direction}`, {
    messageId,
    contactId,
    direction,
    ...details,
  });
}

// Session logging helper
export function logSession(
  action: 'created' | 'refreshed' | 'expired' | 'warning',
  details?: Record<string, unknown>
) {
  const level = action === 'expired' || action === 'warning' ? 'warn' : 'info';
  logger[level](`Session ${action}`, details);
}

// Socket.io event logging helper
export function logSocketEvent(
  event: string,
  socketId: string,
  details?: Record<string, unknown>
) {
  logger.debug(`Socket: ${event}`, {
    socketId,
    ...details,
  });
}

/**
 * Mask contact ID for privacy in logs
 * Shows first 4 and last 2 digits: 1234****89@c.us
 */
function maskContactId(contactId: string): string {
  const phone = contactId.replace('@c.us', '').replace('@s.whatsapp.net', '');
  if (phone.length <= 6) return contactId;
  const suffix = contactId.endsWith('@c.us') ? '@c.us' : '@s.whatsapp.net';
  return phone.slice(0, 4) + '****' + phone.slice(-2) + suffix;
}

/**
 * Log a security event
 * Security events are logged to a separate file for audit purposes
 *
 * @param event - Type of security event
 * @param severity - Event severity (debug, info, warn, error)
 * @param contactId - Optional contact ID (will be masked in logs)
 * @param details - Additional event-specific details
 */
export function logSecurityEvent(
  event: SecurityEventType,
  severity: SecuritySeverity = 'info',
  contactId?: string,
  details?: Record<string, unknown>
): void {
  const logData = {
    category: 'security',
    event,
    contactId: contactId ? maskContactId(contactId) : undefined,
    ...details,
  };

  // Log to appropriate level
  switch (severity) {
    case 'debug':
      logger.debug(`Security: ${event}`, logData);
      break;
    case 'info':
      logger.info(`Security: ${event}`, logData);
      break;
    case 'warn':
      logger.warn(`Security: ${event}`, logData);
      break;
    case 'error':
      logger.error(`Security: ${event}`, logData);
      break;
  }
}

/**
 * Log a pairing-related security event
 * Convenience wrapper for common pairing events
 */
type PairingAction = 'request' | 'approved' | 'denied' | 'code_attempt' | 'revoked';

const PAIRING_EVENT_MAP: Record<PairingAction, SecurityEventType> = {
  request: 'pairing_request',
  approved: 'pairing_approved',
  denied: 'pairing_denied',
  code_attempt: 'pairing_code_attempt',
  revoked: 'pairing_revoked',
};

const PAIRING_SEVERITY_MAP: Record<PairingAction, SecuritySeverity> = {
  request: 'info',
  approved: 'info',
  denied: 'warn',
  code_attempt: 'info',
  revoked: 'warn',
};

export function logPairingEvent(
  action: PairingAction,
  contactId: string,
  details?: Record<string, unknown>
): void {
  logSecurityEvent(PAIRING_EVENT_MAP[action], PAIRING_SEVERITY_MAP[action], contactId, details);
}

/**
 * Log suspicious content detection
 */
export function logSuspiciousContent(
  contactId: string,
  flags: Array<{ type: string; details: string }>,
  riskScore: number,
  preview?: string
): void {
  logSecurityEvent('suspicious_content', 'warn', contactId, {
    flags,
    riskScore,
    preview: preview ? preview.slice(0, 100) : undefined,
  });
}

export default logger;
