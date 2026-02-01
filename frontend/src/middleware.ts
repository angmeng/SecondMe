/**
 * Next.js Middleware for Dashboard API Authentication
 *
 * Protects state-changing API endpoints with API key authentication.
 * Read-only endpoints (GET) remain accessible without authentication.
 *
 * Authentication methods:
 * - Authorization: Bearer <key>
 * - X-API-Key: <key>
 *
 * If DASHBOARD_API_KEY is not set, authentication is bypassed (local dev mode).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Methods that modify state and require authentication
const PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

// API paths that require authentication for state-changing operations
const PROTECTED_PATHS = ['/api/pairing', '/api/skills', '/api/pause', '/api/kill-switch', '/api/documents'];

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns true if strings are equal.
 *
 * Note: We implement this manually because crypto.timingSafeEqual
 * is not available in Edge Runtime. This implementation uses
 * bitwise OR accumulation to ensure constant-time comparison.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Length mismatch reveals information, but this is unavoidable
    // and acceptable for API key validation
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect state-changing methods
  if (!PROTECTED_METHODS.includes(request.method)) {
    return NextResponse.next();
  }

  // Check if path is protected
  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path));
  if (!isProtected) {
    return NextResponse.next();
  }

  // Validate API key
  const API_KEY = process.env.DASHBOARD_API_KEY;

  // If no API key configured, allow (local dev mode)
  if (!API_KEY) {
    return NextResponse.next();
  }

  // Check Authorization header: Bearer <key>
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const key = authHeader.slice(7);
    if (safeCompare(key, API_KEY)) {
      return NextResponse.next();
    }
  }

  // Check X-API-Key header
  const apiKeyHeader = request.headers.get('x-api-key');
  if (apiKeyHeader && safeCompare(apiKeyHeader, API_KEY)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: 'Unauthorized. Provide API key via Authorization or X-API-Key header.' },
    { status: 401 }
  );
}

export const config = {
  matcher: '/api/:path*',
};
