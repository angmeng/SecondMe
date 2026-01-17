/**
 * Security Middleware
 * T119-T121: Input validation, CORS, and rate limiting
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

// Rate limiting state (in-memory, could be upgraded to Redis for production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
};

/**
 * T120: CORS Configuration Middleware
 */
export function corsMiddleware(allowedOrigins: string[] = ['http://localhost:3000']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    // Check if origin is allowed
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    // Set other CORS headers
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * T121: Rate Limiting Middleware
 */
export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests } = { ...DEFAULT_RATE_LIMIT, ...config };

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = getClientKey(req);
    const now = Date.now();

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      logger.warn('Rate limit exceeded', { clientKey: key, count: entry.count });

      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    next();
  };
}

/**
 * Get client identifier for rate limiting
 */
function getClientKey(req: Request): string {
  // Use X-Forwarded-For if behind a proxy, otherwise use remote IP
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket.remoteAddress || 'unknown';

  return `rate:${ip}`;
}

/**
 * T119: Input Validation Middleware
 */
export function validateInput(schema: InputSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validate body
    if (schema.body) {
      const bodyErrors = validateObject(req.body, schema.body, 'body');
      errors.push(...bodyErrors);
    }

    // Validate query params
    if (schema.query) {
      const queryErrors = validateObject(req.query, schema.query, 'query');
      errors.push(...queryErrors);
    }

    // Validate path params
    if (schema.params) {
      const paramErrors = validateObject(req.params, schema.params, 'params');
      errors.push(...paramErrors);
    }

    if (errors.length > 0) {
      logger.warn('Input validation failed', { errors, path: req.path });
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    next();
  };
}

interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: (string | number)[];
  sanitize?: boolean;
}

interface InputSchema {
  body?: Record<string, FieldSchema>;
  query?: Record<string, FieldSchema>;
  params?: Record<string, FieldSchema>;
}

function validateObject(
  obj: Record<string, unknown>,
  schema: Record<string, FieldSchema>,
  location: string
): string[] {
  const errors: string[] = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = obj[field];

    // Check required
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${location}.${field} is required`);
      continue;
    }

    // Skip validation if not present and not required
    if (value === undefined || value === null) continue;

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== rules.type) {
      errors.push(`${location}.${field} must be a ${rules.type}`);
      continue;
    }

    // String validations
    if (rules.type === 'string' && typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${location}.${field} must be at least ${rules.minLength} characters`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${location}.${field} must be at most ${rules.maxLength} characters`);
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${location}.${field} has invalid format`);
      }
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${location}.${field} must be one of: ${rules.enum.join(', ')}`);
      }

      // Sanitize string (remove potential XSS)
      if (rules.sanitize) {
        obj[field] = sanitizeString(value);
      }
    }

    // Number validations
    if (rules.type === 'number' && typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${location}.${field} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${location}.${field} must be at most ${rules.max}`);
      }
    }
  }

  return errors;
}

/**
 * Sanitize string to prevent XSS
 */
function sanitizeString(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Security Headers Middleware
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (basic)
  res.setHeader('Content-Security-Policy', "default-src 'self'");

  next();
}

/**
 * Request ID Middleware
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Clean up rate limit store periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute

// Export validation schemas for common endpoints
export const ValidationSchemas = {
  pause: {
    body: {
      contactId: { type: 'string' as const, required: true, minLength: 1, maxLength: 100 },
      duration: { type: 'number' as const, min: 0, max: 86400 * 7 }, // Max 7 days
    },
  },
  settings: {
    body: {
      enabled: { type: 'boolean' as const },
      startHour: { type: 'number' as const, min: 0, max: 23 },
      startMinute: { type: 'number' as const, min: 0, max: 59 },
      endHour: { type: 'number' as const, min: 0, max: 23 },
      endMinute: { type: 'number' as const, min: 0, max: 59 },
      timezoneOffset: { type: 'number' as const, min: -12, max: 14 },
    },
  },
};
