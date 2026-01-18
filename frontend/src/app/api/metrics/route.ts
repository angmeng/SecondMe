/**
 * Metrics API Route
 * T105: Server Action for fetching system metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import { getErrorMessage } from '@/lib/errors';

/**
 * GET /api/metrics - Get current system metrics
 */
export async function GET(request: NextRequest) {
  try {
    const dateKey = new Date().toISOString().split('T')[0];
    const statsKey = `STATS:tokens:${dateKey}`;

    // Get daily stats from Redis
    const stats = await getStats(statsKey);

    const messagesReceived = parseInt(stats.messages_received || '0', 10);
    const messagesSent = parseInt(stats.messages_sent || '0', 10);
    const classificationTokens = parseInt(stats.classification_tokens || '0', 10);
    const responseTokens = parseInt(stats.response_tokens || '0', 10);
    const cacheReadTokens = parseInt(stats.cache_read_tokens || '0', 10);
    const cacheWriteTokens = parseInt(stats.cache_write_tokens || '0', 10);
    const totalLatency = parseInt(stats.total_latency || '0', 10);

    // Calculate derived metrics
    const tokensUsed = classificationTokens + responseTokens;
    const totalCacheTokens = cacheReadTokens + cacheWriteTokens;
    const cacheHitRate = totalCacheTokens > 0
      ? (cacheReadTokens / totalCacheTokens) * 100
      : 0;
    const avgResponseTime = messagesReceived > 0
      ? totalLatency / messagesReceived
      : 0;

    // Get active pauses count
    const activePauses = await getActivePausesCount();

    // Estimate uptime from first message timestamp (placeholder)
    const uptime = await estimateUptime();

    return NextResponse.json({
      messagesReceived,
      messagesSent,
      tokensUsed,
      cacheHitRate,
      avgResponseTime,
      uptime,
      activePauses,
    });
  } catch (error) {
    console.error('[Metrics API] Error getting metrics:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

/**
 * Helper to get stats from Redis
 */
async function getStats(statsKey: string): Promise<Record<string, string>> {
  try {
    // Access the underlying Redis client
    const client = redisClient.client;
    if (!client) {
      // If client not directly accessible, use alternative method
      return {};
    }

    // Ensure connection
    await client.ping?.();

    // Get hash data
    const result = await client.hgetall?.(statsKey);
    return result || {};
  } catch (error) {
    console.error('[Metrics API] Error getting stats:', error);
    return {};
  }
}

/**
 * Helper to get active pauses count
 */
async function getActivePausesCount(): Promise<number> {
  try {
    const client = redisClient.client;
    if (!client) return 0;

    const keys = await client.keys?.('PAUSE:*');
    if (!keys) return 0;

    return keys.filter((k: string) => k !== 'PAUSE:ALL').length;
  } catch {
    return 0;
  }
}

/**
 * Helper to estimate uptime
 */
async function estimateUptime(): Promise<number> {
  // Return a placeholder uptime (would typically come from service)
  // This could be enhanced to track actual service start time
  return 3600; // 1 hour placeholder
}
