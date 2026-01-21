/**
 * Bot Status Component
 * T104: Comprehensive bot status display showing all service statuses
 */

'use client';

import { useState, useEffect } from 'react';
import { socketClient } from '@/lib/socket';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  latency?: number;
  lastCheck?: number;
  details?: string;
}

interface BotStatusData {
  overall: 'operational' | 'degraded' | 'offline';
  services: ServiceStatus[];
  isSleeping: boolean;
  isGloballyPaused: boolean;
  lastActivity?: number;
}

interface Props {
  className?: string;
  showDetails?: boolean;
}

export default function BotStatus({ className = '', showDetails = true }: Props) {
  const [status, setStatus] = useState<BotStatusData>({
    overall: 'offline',
    services: [],
    isSleeping: false,
    isGloballyPaused: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchStatus();

    // Listen for real-time status updates
    const socket = socketClient.getSocket();

    const handleStatusUpdate = (data: Partial<BotStatusData>) => {
      setStatus((prev) => ({ ...prev, ...data }));
    };

    socket.on('bot_status_update', handleStatusUpdate);

    // Refresh periodically
    const interval = setInterval(fetchStatus, 60000); // Every minute

    return () => {
      socket.off('bot_status_update', handleStatusUpdate);
      clearInterval(interval);
    };
  }, []);

  async function fetchStatus() {
    try {
      setIsRefreshing(true);

      // Fetch from multiple endpoints in parallel
      const [gatewayRes, settingsRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001'}/health`).catch(() => null),
        fetch('/api/settings').catch(() => null),
      ]);

      const services: ServiceStatus[] = [];

      // Gateway status
      if (gatewayRes?.ok) {
        const gatewayData = await gatewayRes.json();
        services.push({
          name: 'Gateway',
          status: gatewayData.status === 'ok' ? 'healthy' : 'degraded',
          details: `WhatsApp: ${gatewayData.whatsapp}, Redis: ${gatewayData.redis}`,
        });

        // WhatsApp connection
        services.push({
          name: 'WhatsApp',
          status: gatewayData.whatsapp === 'connected' ? 'healthy' : 'offline',
          details: gatewayData.whatsapp,
        });

        // Redis
        services.push({
          name: 'Redis',
          status: gatewayData.redis === 'connected' ? 'healthy' : 'offline',
          details: gatewayData.redis,
        });
      } else {
        services.push({ name: 'Gateway', status: 'offline' });
        services.push({ name: 'WhatsApp', status: 'unknown' });
        services.push({ name: 'Redis', status: 'unknown' });
      }

      // Parse settings for sleep/pause status
      let isSleeping = false;
      let isGloballyPaused = false;

      if (settingsRes?.ok) {
        const settingsData = await settingsRes.json();
        isSleeping = settingsData.sleepHours?.status?.isSleeping || false;
        isGloballyPaused = settingsData.globalPause?.active || false;
      }

      // Calculate overall status
      const healthyCount = services.filter((s) => s.status === 'healthy').length;
      let overall: 'operational' | 'degraded' | 'offline' = 'offline';
      if (healthyCount === services.length) {
        overall = 'operational';
      } else if (healthyCount > 0) {
        overall = 'degraded';
      }

      setStatus({
        overall,
        services,
        isSleeping,
        isGloballyPaused,
        lastActivity: Date.now(),
      });
    } catch (err) {
      console.error('[BotStatus] Error fetching status:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  function getStatusConfig(status: BotStatusData['overall']) {
    switch (status) {
      case 'operational':
        return {
          label: 'Operational',
          color: 'text-success-600 dark:text-success-400',
          bg: 'bg-success-100 dark:bg-success-900/30',
          dot: 'bg-success-500',
          border: 'border-success-200 dark:border-success-900/50',
        };
      case 'degraded':
        return {
          label: 'Degraded',
          color: 'text-warning-600 dark:text-warning-400',
          bg: 'bg-warning-100 dark:bg-warning-900/30',
          dot: 'bg-warning-500 animate-pulse',
          border: 'border-warning-200 dark:border-warning-900/50',
        };
      default:
        return {
          label: 'Offline',
          color: 'text-error-600 dark:text-error-400',
          bg: 'bg-error-100 dark:bg-error-900/30',
          dot: 'bg-error-500',
          border: 'border-error-200 dark:border-error-900/50',
        };
    }
  }

  function getServiceStatusColor(serviceStatus: ServiceStatus['status']) {
    switch (serviceStatus) {
      case 'healthy':
        return 'bg-success-500';
      case 'degraded':
        return 'bg-warning-500';
      case 'offline':
        return 'bg-error-500';
      default:
        return 'bg-slate-400';
    }
  }

  const config = getStatusConfig(status.overall);

  if (isLoading) {
    return (
      <div className={`card animate-pulse ${className}`}>
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-8 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    );
  }

  return (
    <div className={`card ${config.border} ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Bot Status</h3>

        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            onClick={fetchStatus}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="Refresh status"
          >
            <svg
              className={`h-4 w-4 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>

          {/* Status badge */}
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${config.bg} ${config.color}`}
          >
            <span className={`h-2 w-2 rounded-full ${config.dot}`} />
            {config.label}
          </span>
        </div>
      </div>

      {/* Status flags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {status.isGloballyPaused && (
          <span className="flex items-center gap-1 rounded-full bg-error-100 px-2 py-0.5 text-xs font-medium text-error-700 dark:bg-error-900/30 dark:text-error-300">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
            Globally Paused
          </span>
        )}
        {status.isSleeping && (
          <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
            Sleeping
          </span>
        )}
      </div>

      {/* Service details */}
      {showDetails && (
        <div className="space-y-2">
          {status.services.map((service) => (
            <div
              key={service.name}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-2 dark:border-slate-700"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${getServiceStatusColor(service.status)}`} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {service.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {service.latency && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {service.latency}ms
                  </span>
                )}
                <span className="text-xs text-slate-400 dark:text-slate-500 capitalize">
                  {service.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Last activity */}
      {status.lastActivity && (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Last checked: {new Date(status.lastActivity).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
