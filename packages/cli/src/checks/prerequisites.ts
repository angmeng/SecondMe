import { execSync } from 'node:child_process';
import type { CategoryResult, CheckResult } from '../utils/output.js';
import { getDockerStatus, isDockerComposeAvailable } from '../utils/docker.js';
import type { HealthCheckOptions } from './index.js';

const REQUIRED_NODE_VERSION = 24;

function checkNodeVersion(): CheckResult {
  try {
    const version = process.version;
    const majorVersion = parseInt(version.slice(1).split('.')[0] ?? '0', 10);

    if (majorVersion >= REQUIRED_NODE_VERSION) {
      return {
        name: 'Node.js',
        status: 'pass',
        message: version,
      };
    }

    return {
      name: 'Node.js',
      status: 'fail',
      message: version,
      detail: `Node.js ${REQUIRED_NODE_VERSION}+ required`,
      fix: `Install Node.js ${REQUIRED_NODE_VERSION}+ from https://nodejs.org/`,
    };
  } catch {
    return {
      name: 'Node.js',
      status: 'fail',
      message: 'Not found',
      fix: `Install Node.js ${REQUIRED_NODE_VERSION}+ from https://nodejs.org/`,
    };
  }
}

function checkNpm(): CheckResult {
  try {
    // Hardcoded command - no user input
    const result = execSync('npm --version', { encoding: 'utf-8', timeout: 5000 });
    const version = result.trim();

    return {
      name: 'npm',
      status: 'pass',
      message: `v${version}`,
    };
  } catch {
    return {
      name: 'npm',
      status: 'fail',
      message: 'Not found',
      fix: 'npm should be included with Node.js installation',
    };
  }
}

function checkDocker(): CheckResult {
  const status = getDockerStatus();

  if (!status.isInstalled) {
    return {
      name: 'Docker',
      status: 'fail',
      message: 'Not installed',
      fix: 'Install Docker from https://docker.com/get-started',
    };
  }

  if (!status.isRunning) {
    return {
      name: 'Docker',
      status: 'fail',
      message: 'Not running',
      detail: `Docker ${status.version ?? ''} installed but daemon not running`,
      fix: 'Start Docker Desktop or run "sudo systemctl start docker"',
    };
  }

  return {
    name: 'Docker',
    status: 'pass',
    message: status.version ? `v${status.version}` : 'Running',
  };
}

function checkDockerCompose(): CheckResult {
  if (!isDockerComposeAvailable()) {
    return {
      name: 'Docker Compose',
      status: 'fail',
      message: 'Not found',
      fix: 'Install Docker Compose (included with Docker Desktop)',
    };
  }

  return {
    name: 'Docker Compose',
    status: 'pass',
    message: 'Available',
  };
}

function checkGit(): CheckResult {
  try {
    // Hardcoded command - no user input
    const result = execSync('git --version', { encoding: 'utf-8', timeout: 5000 });
    const versionMatch = result.match(/git version ([\d.]+)/);

    return {
      name: 'Git',
      status: 'pass',
      message: versionMatch?.[1] ? `v${versionMatch[1]}` : 'Available',
    };
  } catch {
    return {
      name: 'Git',
      status: 'warn',
      message: 'Not found',
      detail: 'Git is recommended for version control',
      fix: 'Install Git from https://git-scm.com/',
    };
  }
}

export async function checkPrerequisites(_options: HealthCheckOptions = {}): Promise<CategoryResult> {
  const checks: CheckResult[] = [
    checkNodeVersion(),
    checkNpm(),
    checkDocker(),
    checkDockerCompose(),
    checkGit(),
  ];

  return {
    name: 'Prerequisites',
    checks,
  };
}
