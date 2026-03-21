import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { checkServices, getServicesStatus } from '../../checks/services.js';

// Mock the env module
vi.mock('../../utils/env.js', () => ({
  getEnvValue: vi.fn(),
}));

import { getEnvValue } from '../../utils/env.js';

const mockGetEnvValue = vi.mocked(getEnvValue);

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('services checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnvValue.mockReturnValue(undefined); // Use default ports
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkServices', () => {
    it('should pass when all services are healthy', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await checkServices();

      expect(result.name).toBe('Services');
      expect(result.checks).toHaveLength(4);

      for (const check of result.checks) {
        expect(check.status).toBe('pass');
        expect(check.message).toMatch(/Healthy \(\d+ms\)/);
      }
    });

    it('should warn when a service is unreachable', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes(':3002')) {
          return Promise.reject(new Error('ECONNREFUSED'));
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      const result = await checkServices();

      const orchestratorCheck = result.checks.find((c) => c.name === 'Orchestrator');
      expect(orchestratorCheck?.status).toBe('warn');
      expect(orchestratorCheck?.message).toBe('Unreachable');
      expect(orchestratorCheck?.fix).toContain('npm run dev');
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes(':3001')) {
          return Promise.resolve({ ok: false, status: 503 });
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      const result = await checkServices();

      const gatewayCheck = result.checks.find((c) => c.name === 'Gateway');
      expect(gatewayCheck?.status).toBe('warn');
      expect(gatewayCheck?.detail).toContain('HTTP 503');
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes(':3003')) {
          return Promise.reject(new Error('The operation was aborted due to timeout'));
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      const result = await checkServices();

      const graphWorkerCheck = result.checks.find((c) => c.name === 'Graph Worker');
      expect(graphWorkerCheck?.status).toBe('warn');
      expect(graphWorkerCheck?.detail).toContain('Timeout');
    });

    it('should use custom ports from environment', async () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'GATEWAY_PORT') return '4001';
        return undefined;
      });

      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await checkServices();

      const gatewayCheck = result.checks.find((c) => c.name === 'Gateway');
      expect(gatewayCheck?.detail).toBe('localhost:4001');
    });
  });

  describe('getServicesStatus', () => {
    it('should return running status for healthy services', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const statuses = await getServicesStatus();

      expect(statuses).toHaveLength(4);
      for (const status of statuses) {
        expect(status.status).toBe('running');
      }
    });

    it('should return stopped status for unreachable services', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const statuses = await getServicesStatus();

      for (const status of statuses) {
        expect(status.status).toBe('stopped');
      }
    });

    it('should include correct URLs', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const statuses = await getServicesStatus();

      const gateway = statuses.find((s) => s.name === 'Gateway');
      expect(gateway?.url).toBe('localhost:3001');

      const frontend = statuses.find((s) => s.name === 'Frontend');
      expect(frontend?.url).toBe('localhost:3000');
    });
  });
});
