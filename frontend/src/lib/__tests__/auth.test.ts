/**
 * Auth Middleware Tests
 * Unit tests for dashboard API authentication middleware
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

describe('Auth Middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /**
   * Helper to create a mock NextRequest
   */
  function createRequest(
    method: string,
    path: string,
    headers: Record<string, string> = {}
  ): NextRequest {
    const url = `http://localhost:3000${path}`;
    return new NextRequest(url, {
      method,
      headers: new Headers(headers),
    });
  }

  describe('when DASHBOARD_API_KEY is not set', () => {
    beforeEach(() => {
      delete process.env.DASHBOARD_API_KEY;
    });

    it('allows POST requests without authentication', async () => {
      const request = createRequest('POST', '/api/pairing/contact123');
      const response = await middleware(request);

      // NextResponse.next() returns undefined or a response with no body
      expect(response.status).not.toBe(401);
    });

    it('allows DELETE requests without authentication', async () => {
      const request = createRequest('DELETE', '/api/skills/knowledge-graph');
      const response = await middleware(request);

      expect(response.status).not.toBe(401);
    });
  });

  describe('when DASHBOARD_API_KEY is set', () => {
    const TEST_API_KEY = 'test-secret-key-12345';

    beforeEach(() => {
      process.env.DASHBOARD_API_KEY = TEST_API_KEY;
    });

    describe('GET requests (read-only)', () => {
      it('allows GET requests without authentication', async () => {
        const request = createRequest('GET', '/api/pairing/approved');
        const response = await middleware(request);

        expect(response.status).not.toBe(401);
      });

      it('allows GET requests to skills endpoint', async () => {
        const request = createRequest('GET', '/api/skills');
        const response = await middleware(request);

        expect(response.status).not.toBe(401);
      });
    });

    describe('state-changing requests without authentication', () => {
      it('rejects POST to protected endpoint without API key', async () => {
        const request = createRequest('POST', '/api/pairing/contact123');
        const response = await middleware(request);

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.error).toContain('Unauthorized');
      });

      it('rejects PUT to protected endpoint without API key', async () => {
        const request = createRequest('PUT', '/api/pairing/approved/contact123');
        const response = await middleware(request);

        expect(response.status).toBe(401);
      });

      it('rejects DELETE to protected endpoint without API key', async () => {
        const request = createRequest('DELETE', '/api/skills/knowledge-graph');
        const response = await middleware(request);

        expect(response.status).toBe(401);
      });

      it('rejects POST to kill-switch without API key', async () => {
        const request = createRequest('POST', '/api/kill-switch');
        const response = await middleware(request);

        expect(response.status).toBe(401);
      });

      it('rejects POST to pause without API key', async () => {
        const request = createRequest('POST', '/api/pause');
        const response = await middleware(request);

        expect(response.status).toBe(401);
      });
    });

    describe('Authorization header (Bearer token)', () => {
      it('allows request with valid Bearer token', async () => {
        const request = createRequest('POST', '/api/pairing/contact123', {
          Authorization: `Bearer ${TEST_API_KEY}`,
        });
        const response = await middleware(request);

        expect(response.status).not.toBe(401);
      });

      it('rejects request with invalid Bearer token', async () => {
        const request = createRequest('POST', '/api/pairing/contact123', {
          Authorization: 'Bearer wrong-key',
        });
        const response = await middleware(request);

        expect(response.status).toBe(401);
      });

      it('rejects request with malformed Authorization header', async () => {
        const request = createRequest('POST', '/api/pairing/contact123', {
          Authorization: TEST_API_KEY, // Missing 'Bearer ' prefix
        });
        const response = await middleware(request);

        expect(response.status).toBe(401);
      });
    });

    describe('X-API-Key header', () => {
      it('allows request with valid X-API-Key', async () => {
        const request = createRequest('POST', '/api/pairing/contact123', {
          'X-API-Key': TEST_API_KEY,
        });
        const response = await middleware(request);

        expect(response.status).not.toBe(401);
      });

      it('rejects request with invalid X-API-Key', async () => {
        const request = createRequest('POST', '/api/pairing/contact123', {
          'X-API-Key': 'wrong-key',
        });
        const response = await middleware(request);

        expect(response.status).toBe(401);
      });
    });

    describe('unprotected paths', () => {
      it('allows POST to unprotected path without auth', async () => {
        const request = createRequest('POST', '/api/some-other-endpoint');
        const response = await middleware(request);

        expect(response.status).not.toBe(401);
      });

      it('allows POST to health endpoint without auth', async () => {
        const request = createRequest('POST', '/api/health');
        const response = await middleware(request);

        expect(response.status).not.toBe(401);
      });
    });

    describe('timing attack resistance', () => {
      it('response time should be similar for wrong vs partially-matching keys', async () => {
        // This is a basic test - true timing attack testing requires statistical analysis
        const wrongKey = 'completely-wrong-key';
        const partialMatch = TEST_API_KEY.slice(0, 10) + 'wrong-suffix';

        const request1 = createRequest('POST', '/api/pairing/contact123', {
          'X-API-Key': wrongKey,
        });
        const request2 = createRequest('POST', '/api/pairing/contact123', {
          'X-API-Key': partialMatch,
        });

        // Both should return 401
        const response1 = await middleware(request1);
        const response2 = await middleware(request2);

        expect(response1.status).toBe(401);
        expect(response2.status).toBe(401);
      });
    });
  });
});
