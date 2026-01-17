/**
 * Health Check API
 * T125: Health endpoint for Docker health checks and monitoring
 */

import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message?: string;
    latencyMs?: number;
  }[];
}

const startTime = Date.now();

export async function GET(): Promise<NextResponse<HealthCheckResult>> {
  const checks: HealthCheckResult['checks'] = [];
  const checkStart = Date.now();

  // Check Redis connectivity
  try {
    const redisStart = Date.now();
    await redisClient.client.ping();
    checks.push({
      name: 'redis',
      status: 'pass',
      latencyMs: Date.now() - redisStart,
    });
  } catch (error) {
    checks.push({
      name: 'redis',
      status: 'fail',
      message: 'Redis connection failed',
    });
  }

  // Check Gateway connectivity
  try {
    const gatewayStart = Date.now();
    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3001';
    const response = await fetch(`${gatewayUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    checks.push({
      name: 'gateway',
      status: response.ok ? 'pass' : 'warn',
      latencyMs: Date.now() - gatewayStart,
      message: response.ok ? undefined : `Status: ${response.status}`,
    });
  } catch {
    checks.push({
      name: 'gateway',
      status: 'warn',
      message: 'Gateway unreachable (may be expected in standalone mode)',
    });
  }

  // Determine overall status
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;

  let status: HealthCheckResult['status'] = 'healthy';
  if (failCount > 0) {
    status = 'unhealthy';
  } else if (warnCount > 0) {
    status = 'degraded';
  }

  const result: HealthCheckResult = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };

  // Return appropriate HTTP status
  const httpStatus = status === 'unhealthy' ? 503 : 200;

  return NextResponse.json(result, { status: httpStatus });
}
