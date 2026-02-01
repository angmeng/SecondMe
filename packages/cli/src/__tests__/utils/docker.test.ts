import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import {
  getDockerStatus,
  isDockerComposeAvailable,
  getContainerStatus,
} from '../../utils/docker.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

describe('docker utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDockerStatus', () => {
    it('should return installed and running when Docker is available', () => {
      mockExecSync
        .mockReturnValueOnce('Docker version 24.0.0, build abc123')
        .mockReturnValueOnce(''); // docker info succeeds

      const status = getDockerStatus();

      expect(status.isInstalled).toBe(true);
      expect(status.isRunning).toBe(true);
      expect(status.version).toBe('24.0.0');
    });

    it('should return installed but not running when daemon is stopped', () => {
      mockExecSync
        .mockReturnValueOnce('Docker version 24.0.0, build abc123')
        .mockImplementationOnce(() => {
          throw new Error('Cannot connect to Docker daemon');
        });

      const status = getDockerStatus();

      expect(status.isInstalled).toBe(true);
      expect(status.isRunning).toBe(false);
      expect(status.version).toBe('24.0.0');
    });

    it('should return not installed when docker command fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found: docker');
      });

      const status = getDockerStatus();

      expect(status.isInstalled).toBe(false);
      expect(status.isRunning).toBe(false);
      expect(status.version).toBeUndefined();
    });
  });

  describe('isDockerComposeAvailable', () => {
    it('should return true when docker compose is available', () => {
      mockExecSync.mockReturnValue('Docker Compose version v2.20.0');

      expect(isDockerComposeAvailable()).toBe(true);
    });

    it('should try docker-compose as fallback', () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('not found');
        })
        .mockReturnValueOnce('docker-compose version 1.29.0');

      expect(isDockerComposeAvailable()).toBe(true);
    });

    it('should return false when neither is available', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      expect(isDockerComposeAvailable()).toBe(false);
    });
  });

  describe('getContainerStatus', () => {
    it('should return running status for running containers', () => {
      mockExecSync.mockReturnValue('running\n');

      const status = getContainerStatus('my-container');

      expect(status.name).toBe('my-container');
      expect(status.status).toBe('running');
    });

    it('should return stopped status for exited containers', () => {
      mockExecSync.mockReturnValue('exited\n');

      const status = getContainerStatus('my-container');

      expect(status.status).toBe('stopped');
    });

    it('should return not_found for non-existent containers', () => {
      mockExecSync.mockReturnValue('');

      const status = getContainerStatus('nonexistent');

      expect(status.status).toBe('not_found');
    });

    it('should reject invalid container names', () => {
      const status = getContainerStatus('invalid; rm -rf /');

      expect(status.status).toBe('not_found');
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should handle docker command errors', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Docker error');
      });

      const status = getContainerStatus('my-container');

      expect(status.status).toBe('not_found');
    });
  });
});
