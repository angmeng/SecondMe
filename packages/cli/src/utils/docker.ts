import { execSync, type ExecSyncOptions } from 'node:child_process';

export interface DockerStatus {
  isInstalled: boolean;
  isRunning: boolean;
  version?: string | undefined;
}

export interface ContainerInfo {
  name: string;
  status: 'running' | 'stopped' | 'not_found';
  health?: string;
}

const EXEC_OPTIONS: ExecSyncOptions = {
  encoding: 'utf-8',
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 10000,
};

/**
 * Check Docker installation and daemon status.
 * Note: Uses execSync with hardcoded commands only - no user input.
 */
export function getDockerStatus(): DockerStatus {
  try {
    const version = execSync('docker --version', EXEC_OPTIONS) as string;
    const versionMatch = version.match(/Docker version ([\d.]+)/);

    // Check if Docker daemon is running
    try {
      execSync('docker info', { ...EXEC_OPTIONS, stdio: ['pipe', 'pipe', 'pipe'] });
      return {
        isInstalled: true,
        isRunning: true,
        version: versionMatch?.[1],
      };
    } catch {
      return {
        isInstalled: true,
        isRunning: false,
        version: versionMatch?.[1],
      };
    }
  } catch {
    return {
      isInstalled: false,
      isRunning: false,
    };
  }
}

export function isDockerComposeAvailable(): boolean {
  try {
    execSync('docker compose version', EXEC_OPTIONS);
    return true;
  } catch {
    try {
      execSync('docker-compose version', EXEC_OPTIONS);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get status of a specific container.
 * Container name is validated to contain only safe characters.
 */
export function getContainerStatus(containerName: string): ContainerInfo {
  // Validate container name to prevent injection
  if (!/^[a-zA-Z0-9_-]+$/.test(containerName)) {
    return { name: containerName, status: 'not_found' };
  }

  try {
    const result = execSync(
      `docker ps -a --filter "name=${containerName}" --format "{{.State}}"`,
      EXEC_OPTIONS
    ) as string;

    const state = result.trim().toLowerCase();

    if (state === '') {
      return { name: containerName, status: 'not_found' };
    }

    return {
      name: containerName,
      status: state === 'running' ? 'running' : 'stopped',
    };
  } catch {
    return { name: containerName, status: 'not_found' };
  }
}

/**
 * Start Docker Compose services.
 * Service names are validated to contain only safe characters.
 */
export function startDockerCompose(
  services?: string[],
  detached: boolean = true
): { success: boolean; error?: string } {
  try {
    // Validate service names
    if (services?.some((s) => !/^[a-zA-Z0-9_-]+$/.test(s))) {
      return { success: false, error: 'Invalid service name' };
    }

    const detachedFlag = detached ? '-d' : '';
    const serviceArgs = services?.join(' ') ?? '';
    const command = `docker compose up ${detachedFlag} ${serviceArgs}`.trim();

    execSync(command, {
      ...EXEC_OPTIONS,
      stdio: 'inherit',
      timeout: 120000, // 2 minute timeout for starting services
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export function stopDockerCompose(): { success: boolean; error?: string } {
  try {
    execSync('docker compose down', {
      ...EXEC_OPTIONS,
      stdio: 'inherit',
      timeout: 60000,
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function waitForContainer(
  containerName: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < timeoutMs) {
    const status = getContainerStatus(containerName);
    if (status.status === 'running') {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false;
}

/**
 * Get logs from a container.
 * Container name is validated to contain only safe characters.
 */
export function getDockerLogs(containerName: string, lines: number = 50): string | null {
  // Validate container name
  if (!/^[a-zA-Z0-9_-]+$/.test(containerName)) {
    return null;
  }

  // Validate lines is a reasonable number
  const safeLines = Math.min(Math.max(1, Math.floor(lines)), 1000);

  try {
    const result = execSync(
      `docker logs --tail ${safeLines} ${containerName}`,
      EXEC_OPTIONS
    ) as string;
    return result;
  } catch {
    return null;
  }
}
