import type { CategoryResult, CheckResult } from '../utils/output.js';
import { getEnvValue } from '../utils/env.js';
import type { HealthCheckOptions } from './index.js';

interface RedisCheckResult {
  connected: boolean;
  latency?: number;
  error?: string;
}

interface FalkorDBCheckResult {
  connected: boolean;
  latency?: number;
  error?: string;
}

async function pingRedis(): Promise<RedisCheckResult> {
  const host = getEnvValue('REDIS_HOST') ?? 'localhost';
  const port = getEnvValue('REDIS_PORT') ?? '6380';

  try {
    const startTime = Date.now();
    const response = await fetch(`http://${host}:${port}`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    // Redis doesn't respond to HTTP, but if we get a connection error
    // with a specific pattern, it means Redis is listening
    if (!response.ok) {
      // Check if we can connect via TCP
      return await tcpPingRedis(host, parseInt(port, 10));
    }

    const latency = Date.now() - startTime;
    return { connected: true, latency };
  } catch (error) {
    // Connection refused means Redis isn't running
    // Connection reset or protocol error means Redis IS running (just not HTTP)
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('ECONNREFUSED')) {
      return { connected: false, error: 'Connection refused' };
    }

    // Try TCP ping as fallback
    return await tcpPingRedis(host, parseInt(port, 10));
  }
}

async function tcpPingRedis(host: string, port: number): Promise<RedisCheckResult> {
  const net = await import('node:net');

  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(5000);

    socket.on('connect', () => {
      const latency = Date.now() - startTime;
      socket.destroy();
      resolve({ connected: true, latency });
    });

    socket.on('error', (error) => {
      socket.destroy();
      resolve({ connected: false, error: error.message });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ connected: false, error: 'Connection timeout' });
    });

    socket.connect(port, host);
  });
}

async function checkRedisHealth(): Promise<CheckResult> {
  const host = getEnvValue('REDIS_HOST') ?? 'localhost';
  const port = getEnvValue('REDIS_PORT') ?? '6380';

  const result = await pingRedis();

  if (result.connected) {
    return {
      name: 'Redis',
      status: 'pass',
      message: `Connected (${host}:${port})`,
      detail: result.latency ? `Latency: ${result.latency}ms` : undefined,
    };
  }

  return {
    name: 'Redis',
    status: 'fail',
    message: 'Unreachable',
    detail: `${host}:${port} - ${result.error ?? 'Unknown error'}`,
    fix: "Run 'docker compose up -d redis' or check REDIS_HOST/PORT in .env",
  };
}

async function pingFalkorDB(): Promise<FalkorDBCheckResult> {
  const host = getEnvValue('FALKORDB_HOST') ?? 'localhost';
  const port = getEnvValue('FALKORDB_PORT') ?? '6379';

  return await tcpPingFalkorDB(host, parseInt(port, 10));
}

async function tcpPingFalkorDB(host: string, port: number): Promise<FalkorDBCheckResult> {
  const net = await import('node:net');

  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(5000);

    socket.on('connect', () => {
      const latency = Date.now() - startTime;
      socket.destroy();
      resolve({ connected: true, latency });
    });

    socket.on('error', (error) => {
      socket.destroy();
      resolve({ connected: false, error: error.message });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ connected: false, error: 'Connection timeout' });
    });

    socket.connect(port, host);
  });
}

async function checkFalkorDBHealth(): Promise<CheckResult> {
  const host = getEnvValue('FALKORDB_HOST') ?? 'localhost';
  const port = getEnvValue('FALKORDB_PORT') ?? '6379';

  const result = await pingFalkorDB();

  if (result.connected) {
    return {
      name: 'FalkorDB',
      status: 'pass',
      message: `Connected (${host}:${port})`,
      detail: result.latency ? `Latency: ${result.latency}ms` : undefined,
    };
  }

  return {
    name: 'FalkorDB',
    status: 'fail',
    message: 'Unreachable',
    detail: `${host}:${port} - ${result.error ?? 'Unknown error'}`,
    fix: "Run 'docker compose up -d falkordb' or check FALKORDB_HOST/PORT in .env",
  };
}

export async function checkInfrastructure(_options: HealthCheckOptions = {}): Promise<CategoryResult> {
  const checks = await Promise.all([
    checkRedisHealth(),
    checkFalkorDBHealth(),
  ]);

  return {
    name: 'Infrastructure',
    checks,
  };
}
