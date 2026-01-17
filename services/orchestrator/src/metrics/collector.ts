/**
 * Metrics Collector
 * T111: Collects and publishes system metrics for monitoring
 */

import { redisClient } from '../redis/client.js';

export interface SystemMetrics {
  messagesReceived: number;
  messagesSent: number;
  tokensUsed: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheHitRate: number;
  avgResponseTime: number;
  uptime: number;
  activePauses: number;
  deferredMessages: number;
}

export interface MessageMetrics {
  messageId: string;
  contactId: string;
  classification: 'phatic' | 'substantive';
  classificationTokens: number;
  responseTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalLatencyMs: number;
  timestamp: number;
}

const startTime = Date.now();

class MetricsCollector {
  private metricsCache: Partial<SystemMetrics> = {};
  private cacheExpiry: number = 0;
  private publishInterval: NodeJS.Timeout | null = null;

  /**
   * Start periodic metrics publishing
   */
  startPublishing(intervalMs: number = 30000): void {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
    }

    this.publishInterval = setInterval(async () => {
      try {
        await this.publishMetrics();
      } catch (error) {
        console.error('[MetricsCollector] Error publishing metrics:', error);
      }
    }, intervalMs);

    console.log(`[MetricsCollector] Started publishing metrics every ${intervalMs}ms`);
  }

  /**
   * Stop publishing metrics
   */
  stopPublishing(): void {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
      console.log('[MetricsCollector] Stopped publishing metrics');
    }
  }

  /**
   * Record a message processing event
   */
  async recordMessage(metrics: MessageMetrics): Promise<void> {
    try {
      const dateKey = new Date().toISOString().split('T')[0];
      const statsKey = `STATS:tokens:${dateKey}`;

      // Increment daily counters
      await redisClient.client.hincrby(statsKey, 'messages_received', 1);
      await redisClient.client.hincrby(statsKey, 'classification_tokens', metrics.classificationTokens);
      await redisClient.client.hincrby(statsKey, 'response_tokens', metrics.responseTokens);
      await redisClient.client.hincrby(statsKey, 'cache_read_tokens', metrics.cacheReadTokens);
      await redisClient.client.hincrby(statsKey, 'cache_write_tokens', metrics.cacheWriteTokens);
      await redisClient.client.hincrby(statsKey, 'total_latency', metrics.totalLatencyMs);

      // Set expiry on stats key (30 days)
      await redisClient.client.expire(statsKey, 30 * 24 * 60 * 60);

      // Store individual message metrics for detailed analysis
      const logEntry = JSON.stringify(metrics);
      await redisClient.client.zadd('LOGS:messages', metrics.timestamp, logEntry);

      // Trim old logs (keep last 10000)
      const count = await redisClient.client.zcard('LOGS:messages');
      if (count > 10000) {
        await redisClient.client.zremrangebyrank('LOGS:messages', 0, count - 10001);
      }

      // Invalidate cache
      this.cacheExpiry = 0;

    } catch (error) {
      console.error('[MetricsCollector] Error recording message:', error);
    }
  }

  /**
   * Record a message sent event
   */
  async recordMessageSent(): Promise<void> {
    try {
      const dateKey = new Date().toISOString().split('T')[0];
      await redisClient.client.hincrby(`STATS:tokens:${dateKey}`, 'messages_sent', 1);
    } catch (error) {
      console.error('[MetricsCollector] Error recording sent message:', error);
    }
  }

  /**
   * Get current system metrics
   */
  async getMetrics(): Promise<SystemMetrics> {
    const now = Date.now();

    // Return cached metrics if still valid
    if (now < this.cacheExpiry && this.metricsCache.messagesReceived !== undefined) {
      return this.metricsCache as SystemMetrics;
    }

    try {
      const dateKey = new Date().toISOString().split('T')[0];
      const statsKey = `STATS:tokens:${dateKey}`;

      // Get daily stats
      const stats = await redisClient.client.hgetall(statsKey);

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
      const pauseKeys = await redisClient.client.keys('PAUSE:*');
      const activePauses = pauseKeys.filter(k => k !== 'PAUSE:ALL').length;

      // Get deferred messages count
      const deferredMessages = await redisClient.client.zcard('DEFERRED:messages');

      // Calculate uptime
      const uptime = Math.floor((now - startTime) / 1000);

      const metrics: SystemMetrics = {
        messagesReceived,
        messagesSent,
        tokensUsed,
        cacheReadTokens,
        cacheWriteTokens,
        cacheHitRate,
        avgResponseTime,
        uptime,
        activePauses,
        deferredMessages,
      };

      // Cache for 10 seconds
      this.metricsCache = metrics;
      this.cacheExpiry = now + 10000;

      return metrics;

    } catch (error) {
      console.error('[MetricsCollector] Error getting metrics:', error);
      return {
        messagesReceived: 0,
        messagesSent: 0,
        tokensUsed: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheHitRate: 0,
        avgResponseTime: 0,
        uptime: Math.floor((now - startTime) / 1000),
        activePauses: 0,
        deferredMessages: 0,
      };
    }
  }

  /**
   * Publish metrics to Redis pub/sub for real-time updates
   */
  async publishMetrics(): Promise<void> {
    const metrics = await this.getMetrics();

    await redisClient.publish('metrics:system', JSON.stringify({
      type: 'metrics_update',
      data: metrics,
      timestamp: Date.now(),
    }));
  }

  /**
   * Get historical metrics for a date range
   */
  async getHistoricalMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; metrics: Partial<SystemMetrics> }>> {
    const results: Array<{ date: string; metrics: Partial<SystemMetrics> }> = [];

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateKey = current.toISOString().split('T')[0];
      const stats = await redisClient.client.hgetall(`STATS:tokens:${dateKey}`);

      if (Object.keys(stats).length > 0) {
        results.push({
          date: dateKey,
          metrics: {
            messagesReceived: parseInt(stats.messages_received || '0', 10),
            messagesSent: parseInt(stats.messages_sent || '0', 10),
            tokensUsed: parseInt(stats.classification_tokens || '0', 10) +
                        parseInt(stats.response_tokens || '0', 10),
          },
        });
      }

      current.setDate(current.getDate() + 1);
    }

    return results;
  }

  /**
   * Get recent message logs
   */
  async getRecentLogs(count: number = 100): Promise<MessageMetrics[]> {
    try {
      const logs = await redisClient.client.zrevrange('LOGS:messages', 0, count - 1);
      return logs.map(log => JSON.parse(log));
    } catch (error) {
      console.error('[MetricsCollector] Error getting recent logs:', error);
      return [];
    }
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Array<{
      name: string;
      status: 'pass' | 'warn' | 'fail';
      message?: string;
    }>;
  }> {
    const checks: Array<{
      name: string;
      status: 'pass' | 'warn' | 'fail';
      message?: string;
    }> = [];

    // Check Redis connection
    try {
      await redisClient.client.ping();
      checks.push({ name: 'redis', status: 'pass' });
    } catch {
      checks.push({ name: 'redis', status: 'fail', message: 'Redis connection failed' });
    }

    // Check uptime
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    if (uptime < 60) {
      checks.push({ name: 'uptime', status: 'warn', message: 'Recently started' });
    } else {
      checks.push({ name: 'uptime', status: 'pass' });
    }

    // Determine overall status
    const failCount = checks.filter(c => c.status === 'fail').length;
    const warnCount = checks.filter(c => c.status === 'warn').length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (failCount > 0) {
      status = 'unhealthy';
    } else if (warnCount > 0) {
      status = 'degraded';
    }

    return { status, checks };
  }
}

// Export singleton instance
export const metricsCollector = new MetricsCollector();
