/**
 * Metrics Display Component
 * T103: Shows real-time metrics about bot activity and performance
 */

'use client';

import { useState, useEffect } from 'react';
import { socketClient } from '@/lib/socket';

interface Metrics {
  messagesReceived: number;
  messagesSent: number;
  tokensUsed: number;
  cacheHitRate: number;
  avgResponseTime: number;
  uptime: number;
  activePauses: number;
}

interface Props {
  className?: string;
  compact?: boolean;
}

export default function MetricsDisplay({ className = '', compact = false }: Props) {
  const [metrics, setMetrics] = useState<Metrics>({
    messagesReceived: 0,
    messagesSent: 0,
    tokensUsed: 0,
    cacheHitRate: 0,
    avgResponseTime: 0,
    uptime: 0,
    activePauses: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    // Fetch initial metrics
    fetchMetrics();

    // Listen for real-time metric updates
    const socket = socketClient.getSocket();

    const handleMetricsUpdate = (data: Partial<Metrics>) => {
      setMetrics((prev) => ({ ...prev, ...data }));
      setLastUpdate(new Date());
    };

    socket.on('metrics_update', handleMetricsUpdate);

    // Refresh metrics periodically
    const interval = setInterval(fetchMetrics, 30000); // Every 30 seconds

    return () => {
      socket.off('metrics_update', handleMetricsUpdate);
      clearInterval(interval);
    };
  }, []);

  async function fetchMetrics() {
    try {
      const response = await fetch('/api/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.error('[MetricsDisplay] Error fetching metrics:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  }

  function formatTokens(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }

  const metricItems = [
    {
      label: 'Messages Received',
      value: metrics.messagesReceived,
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      ),
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Messages Sent',
      value: metrics.messagesSent,
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
        />
      ),
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Tokens Used',
      value: formatTokens(metrics.tokensUsed),
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      ),
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      label: 'Cache Hit Rate',
      value: `${metrics.cacheHitRate.toFixed(0)}%`,
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      ),
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-100 dark:bg-amber-900/30',
    },
    {
      label: 'Avg Response Time',
      value: `${metrics.avgResponseTime.toFixed(0)}ms`,
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      ),
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-100 dark:bg-teal-900/30',
    },
    {
      label: 'Uptime',
      value: formatUptime(metrics.uptime),
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      ),
      color: 'text-slate-600 dark:text-slate-400',
      bg: 'bg-slate-100 dark:bg-slate-700/30',
    },
  ];

  if (isLoading) {
    return (
      <div className={`card animate-pulse ${className}`}>
        <div className="mb-4 h-6 w-1/4 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex flex-wrap gap-4 ${className}`}>
        {metricItems.slice(0, 4).map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${item.color}`}>{item.value}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`card ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">System Metrics</h3>
        {lastUpdate && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metricItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.bg}`}>
              <svg className={`h-5 w-5 ${item.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {item.icon}
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{item.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Active Pauses */}
      {metrics.activePauses > 0 && (
        <div className="mt-4 flex items-center gap-2 text-sm text-warning-600 dark:text-warning-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {metrics.activePauses} contact(s) currently paused
        </div>
      )}
    </div>
  );
}
