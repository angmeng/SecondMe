import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { checkPrerequisites } from '../../checks/prerequisites.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock docker utils
vi.mock('../../utils/docker.js', () => ({
  getDockerStatus: vi.fn(),
  isDockerComposeAvailable: vi.fn(),
}));

import { getDockerStatus, isDockerComposeAvailable } from '../../utils/docker.js';

const mockExecSync = vi.mocked(execSync);
const mockGetDockerStatus = vi.mocked(getDockerStatus);
const mockIsDockerComposeAvailable = vi.mocked(isDockerComposeAvailable);

describe('prerequisites checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkPrerequisites', () => {
    it('should pass all checks when everything is installed', async () => {
      // Mock npm
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'npm --version') return '10.2.0\n';
        if (cmd === 'git --version') return 'git version 2.42.0\n';
        return '';
      });

      // Mock Docker
      mockGetDockerStatus.mockReturnValue({
        isInstalled: true,
        isRunning: true,
        version: '24.0.0',
      });
      mockIsDockerComposeAvailable.mockReturnValue(true);

      const result = await checkPrerequisites();

      expect(result.name).toBe('Prerequisites');

      // Node.js check uses process.version, should pass on Node 24+
      const nodeCheck = result.checks.find((c) => c.name === 'Node.js');
      expect(nodeCheck?.status).toBe('pass');

      // npm check
      const npmCheck = result.checks.find((c) => c.name === 'npm');
      expect(npmCheck?.status).toBe('pass');
      expect(npmCheck?.message).toBe('v10.2.0');

      // Docker check
      const dockerCheck = result.checks.find((c) => c.name === 'Docker');
      expect(dockerCheck?.status).toBe('pass');
      expect(dockerCheck?.message).toBe('v24.0.0');

      // Docker Compose check
      const composeCheck = result.checks.find((c) => c.name === 'Docker Compose');
      expect(composeCheck?.status).toBe('pass');

      // Git check
      const gitCheck = result.checks.find((c) => c.name === 'Git');
      expect(gitCheck?.status).toBe('pass');
      expect(gitCheck?.message).toBe('v2.42.0');
    });

    it('should fail when Docker is not installed', async () => {
      mockExecSync.mockReturnValue('10.2.0\n');
      mockGetDockerStatus.mockReturnValue({
        isInstalled: false,
        isRunning: false,
      });
      mockIsDockerComposeAvailable.mockReturnValue(false);

      const result = await checkPrerequisites();

      const dockerCheck = result.checks.find((c) => c.name === 'Docker');
      expect(dockerCheck?.status).toBe('fail');
      expect(dockerCheck?.message).toBe('Not installed');
      expect(dockerCheck?.fix).toContain('docker.com');
    });

    it('should fail when Docker is installed but not running', async () => {
      mockExecSync.mockReturnValue('10.2.0\n');
      mockGetDockerStatus.mockReturnValue({
        isInstalled: true,
        isRunning: false,
        version: '24.0.0',
      });
      mockIsDockerComposeAvailable.mockReturnValue(true);

      const result = await checkPrerequisites();

      const dockerCheck = result.checks.find((c) => c.name === 'Docker');
      expect(dockerCheck?.status).toBe('fail');
      expect(dockerCheck?.message).toBe('Not running');
      expect(dockerCheck?.fix).toContain('Start Docker');
    });

    it('should fail when Docker Compose is not available', async () => {
      mockExecSync.mockReturnValue('10.2.0\n');
      mockGetDockerStatus.mockReturnValue({
        isInstalled: true,
        isRunning: true,
        version: '24.0.0',
      });
      mockIsDockerComposeAvailable.mockReturnValue(false);

      const result = await checkPrerequisites();

      const composeCheck = result.checks.find((c) => c.name === 'Docker Compose');
      expect(composeCheck?.status).toBe('fail');
      expect(composeCheck?.message).toBe('Not found');
    });

    it('should warn when Git is not installed', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'npm --version') return '10.2.0\n';
        if (cmd === 'git --version') throw new Error('command not found');
        return '';
      });

      mockGetDockerStatus.mockReturnValue({
        isInstalled: true,
        isRunning: true,
        version: '24.0.0',
      });
      mockIsDockerComposeAvailable.mockReturnValue(true);

      const result = await checkPrerequisites();

      const gitCheck = result.checks.find((c) => c.name === 'Git');
      expect(gitCheck?.status).toBe('warn');
      expect(gitCheck?.message).toBe('Not found');
    });

    it('should fail when npm is not available', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'npm --version') throw new Error('command not found');
        if (cmd === 'git --version') return 'git version 2.42.0\n';
        return '';
      });

      mockGetDockerStatus.mockReturnValue({
        isInstalled: true,
        isRunning: true,
        version: '24.0.0',
      });
      mockIsDockerComposeAvailable.mockReturnValue(true);

      const result = await checkPrerequisites();

      const npmCheck = result.checks.find((c) => c.name === 'npm');
      expect(npmCheck?.status).toBe('fail');
      expect(npmCheck?.message).toBe('Not found');
    });
  });
});
