import type { CategoryResult, CheckResult } from '../utils/output.js';
import { getEnvValue } from '../utils/env.js';
import type { HealthCheckOptions } from './index.js';

interface ServiceConfig {
  name: string;
  envPortKey: string;
  defaultPort: number;
  healthPath: string;
}

const SERVICES: ServiceConfig[] = [
  {
    name: 'Gateway',
    envPortKey: 'GATEWAY_PORT',
    defaultPort: 3001,
    healthPath: '/health',
  },
  {
    name: 'Orchestrator',
    envPortKey: 'ORCHESTRATOR_PORT',
    defaultPort: 3002,
    healthPath: '/health',
  },
  {
    name: 'Graph Worker',
    envPortKey: 'GRAPH_WORKER_PORT',
    defaultPort: 3003,
    healthPath: '/health',
  },
  {
    name: 'Frontend',
    envPortKey: 'FRONTEND_PORT',
    defaultPort: 3000,
    healthPath: '/api/health',
  },
];

interface HealthResponse {
  healthy: boolean;
  latency: number;
  status?: number;
  error?: string;
}

async function checkServiceHealth(service: ServiceConfig): Promise<HealthResponse> {
  const port = parseInt(getEnvValue(service.envPortKey) ?? String(service.defaultPort), 10);
  const url = `http://localhost:${port}${service.healthPath}`;

  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - startTime;

    if (response.ok) {
      return { healthy: true, latency, status: response.status };
    }

    return {
      healthy: false,
      latency,
      status: response.status,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('ECONNREFUSED')) {
      return { healthy: false, latency: 0, error: 'Connection refused' };
    }

    if (message.includes('timeout') || message.includes('aborted')) {
      return { healthy: false, latency: 5000, error: 'Timeout' };
    }

    return { healthy: false, latency: 0, error: message };
  }
}

async function checkService(service: ServiceConfig): Promise<CheckResult> {
  const port = parseInt(getEnvValue(service.envPortKey) ?? String(service.defaultPort), 10);
  const result = await checkServiceHealth(service);

  if (result.healthy) {
    return {
      name: service.name,
      status: 'pass',
      message: `Healthy (${result.latency}ms)`,
      detail: `localhost:${port}`,
    };
  }

  return {
    name: service.name,
    status: 'warn',
    message: 'Unreachable',
    detail: `localhost:${port} - ${result.error ?? 'Unknown error'}`,
    fix: `Run 'npm run dev' or 'docker compose up -d'`,
  };
}

export async function checkServices(_options: HealthCheckOptions = {}): Promise<CategoryResult> {
  const checks = await Promise.all(SERVICES.map(checkService));

  return {
    name: 'Services',
    checks,
  };
}

export async function getServicesStatus(): Promise<Array<{
  name: string;
  status: 'running' | 'stopped';
  url: string;
}>> {
  const results = await Promise.all(
    SERVICES.map(async (service) => {
      const port = parseInt(getEnvValue(service.envPortKey) ?? String(service.defaultPort), 10);
      const health = await checkServiceHealth(service);

      return {
        name: service.name,
        status: health.healthy ? 'running' as const : 'stopped' as const,
        url: `localhost:${port}`,
      };
    })
  );

  return results;
}
