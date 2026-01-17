/**
 * Logger Utility
 * T116: Structured logging with winston for error handling and debugging
 */

import winston from 'winston';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

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

// Add file transports in production
if (NODE_ENV === 'production') {
  const logsDir = resolve(__dirname, '../../../../logs');

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

export default logger;
