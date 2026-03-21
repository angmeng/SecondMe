import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the entire infrastructure module's internal functions by mocking dependencies
vi.mock('../../utils/env.js', () => ({
  getEnvValue: vi.fn(),
}));

import { getEnvValue } from '../../utils/env.js';

const mockGetEnvValue = vi.mocked(getEnvValue);

// Since net.Socket is hard to mock, we'll test the checkInfrastructure function
// by actually importing it and mocking at a higher level using vi.doMock
// For now, we'll create a simplified test that verifies the function signature
// and basic error handling

describe('infrastructure checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnvValue.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkInfrastructure', () => {
    it('should return correct category structure', async () => {
      // Import dynamically to avoid hoisting issues
      const { checkInfrastructure } = await import('../../checks/infrastructure.js');

      const result = await checkInfrastructure();

      expect(result.name).toBe('Infrastructure');
      expect(result.checks).toHaveLength(2);
      expect(result.checks.map((c) => c.name)).toEqual(['Redis', 'FalkorDB']);
    });

    it('should include Redis check with default host/port', async () => {
      mockGetEnvValue.mockReturnValue(undefined);

      const { checkInfrastructure } = await import('../../checks/infrastructure.js');
      const result = await checkInfrastructure();

      const redisCheck = result.checks.find((c) => c.name === 'Redis');
      expect(redisCheck).toBeDefined();
      // The check will either pass (if Redis is running) or fail with connection info
      expect(['pass', 'fail']).toContain(redisCheck?.status);
    });

    it('should include FalkorDB check', async () => {
      const { checkInfrastructure } = await import('../../checks/infrastructure.js');
      const result = await checkInfrastructure();

      const falkorCheck = result.checks.find((c) => c.name === 'FalkorDB');
      expect(falkorCheck).toBeDefined();
      expect(['pass', 'fail']).toContain(falkorCheck?.status);
    });

    it('should use custom Redis host from env', async () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'REDIS_HOST') return 'custom-redis';
        if (key === 'REDIS_PORT') return '6381';
        return undefined;
      });

      const { checkInfrastructure } = await import('../../checks/infrastructure.js');
      const result = await checkInfrastructure();

      const redisCheck = result.checks.find((c) => c.name === 'Redis');
      // Should contain the custom host info in message or detail
      const checkInfo = `${redisCheck?.message ?? ''} ${redisCheck?.detail ?? ''}`;
      expect(checkInfo).toContain('custom-redis');
    });

    it('should use custom FalkorDB host from env', async () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'FALKORDB_HOST') return 'custom-falkor';
        if (key === 'FALKORDB_PORT') return '6382';
        return undefined;
      });

      const { checkInfrastructure } = await import('../../checks/infrastructure.js');
      const result = await checkInfrastructure();

      const falkorCheck = result.checks.find((c) => c.name === 'FalkorDB');
      const checkInfo = `${falkorCheck?.message ?? ''} ${falkorCheck?.detail ?? ''}`;
      expect(checkInfo).toContain('custom-falkor');
    });

    it('should provide fix suggestion when check fails', async () => {
      // Use localhost with a port that's unlikely to be in use
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'REDIS_HOST') return '127.0.0.1';
        if (key === 'REDIS_PORT') return '59999'; // Unlikely to be used
        return undefined;
      });

      const { checkInfrastructure } = await import('../../checks/infrastructure.js');
      const result = await checkInfrastructure();

      const redisCheck = result.checks.find((c) => c.name === 'Redis');
      // If the check fails (expected), verify fix is provided
      if (redisCheck?.status === 'fail') {
        expect(redisCheck.fix).toBeDefined();
        expect(redisCheck.fix).toContain('docker compose');
      }
      // If somehow it passes (unlikely), that's also fine
    }, 15000); // Allow longer timeout for network operations
  });
});
