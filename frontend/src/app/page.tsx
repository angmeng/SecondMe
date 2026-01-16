/**
 * Dashboard Home Page
 * Main control panel for SecondMe Personal AI Clone - Redesigned
 */

'use client';

import { useEffect, useState } from 'react';
import { socketClient } from '@/lib/socket';
import KillSwitch from '@/components/KillSwitch';
import Link from 'next/link';
import { EmptyStateNoActivity } from '@/components/ui/EmptyState';

type ConnectionStatus = 'disconnected' | 'qr' | 'connected' | 'ready';

interface RecentActivity {
  id: string;
  type: 'message_received' | 'message_sent' | 'pause' | 'rate_limit';
  contactId: string;
  contactName?: string;
  timestamp: number;
  details?: string;
}

export default function HomePage() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'messages' | 'pauses'>('all');

  useEffect(() => {
    const socket = socketClient.getSocket();
    setIsSocketConnected(socket.connected);

    socketClient.onConnectionStatus((data) => {
      console.log('[Dashboard] Connection status:', data.status);
      setConnectionStatus(data.status);
    });

    socketClient.onMessageStatus((data) => {
      addActivity({
        id: data.messageId,
        type: data.status === 'sent' ? 'message_sent' : 'message_received',
        contactId: data.messageId.split('@')[0] || data.messageId,
        timestamp: data.timestamp,
      });
    });

    socketClient.onPauseUpdate((data) => {
      addActivity({
        id: `pause-${Date.now()}`,
        type: 'pause',
        contactId: data.contactId,
        timestamp: Date.now(),
        details: data.reason || 'manual',
      });
    });

    return () => {};
  }, []);

  function addActivity(activity: RecentActivity) {
    setRecentActivity((prev) => [activity, ...prev].slice(0, 20));
  }

  function getStatusConfig(status: ConnectionStatus) {
    switch (status) {
      case 'ready':
        return {
          label: 'Connected',
          color: 'text-success-600 dark:text-success-400',
          bg: 'bg-success-100 dark:bg-success-900/30',
          dot: 'bg-success-500 shadow-glow-success',
        };
      case 'connected':
        return {
          label: 'Authenticating...',
          color: 'text-warning-600 dark:text-warning-400',
          bg: 'bg-warning-100 dark:bg-warning-900/30',
          dot: 'bg-warning-500 shadow-glow-warning animate-pulse-subtle',
        };
      case 'qr':
        return {
          label: 'Awaiting Scan',
          color: 'text-warning-600 dark:text-warning-400',
          bg: 'bg-warning-100 dark:bg-warning-900/30',
          dot: 'bg-warning-500 shadow-glow-warning animate-pulse-subtle',
        };
      default:
        return {
          label: 'Disconnected',
          color: 'text-error-600 dark:text-error-400',
          bg: 'bg-error-100 dark:bg-error-900/30',
          dot: 'bg-error-500 shadow-glow-error',
        };
    }
  }

  function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  const filteredActivity = recentActivity.filter((activity) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'messages') return activity.type.includes('message');
    if (activeFilter === 'pauses') return activity.type === 'pause' || activity.type === 'rate_limit';
    return true;
  });

  const statusConfig = getStatusConfig(connectionStatus);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Personal AI Clone Control Panel
              </p>
            </div>

            {/* Quick action */}
            {connectionStatus !== 'ready' && (
              <Link
                href="/auth"
                className="btn btn-primary animate-fade-in"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
                Connect WhatsApp
              </Link>
            )}
          </div>
        </header>

        {/* Status Cards Grid */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* WhatsApp Connection Status */}
          <div className="card animate-fade-in-up">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  WhatsApp Status
                </p>
                <p className={`mt-1 text-xl font-semibold ${statusConfig.color}`}>
                  {statusConfig.label}
                </p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${statusConfig.bg}`}>
                <svg
                  className={`h-6 w-6 ${statusConfig.color}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${statusConfig.dot}`} />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {connectionStatus === 'ready' ? 'All systems operational' : 'Action required'}
              </span>
            </div>
          </div>

          {/* Real-time Connection */}
          <div className="card animate-fade-in-up" style={{ animationDelay: '50ms' }}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Real-time Updates
                </p>
                <p
                  className={`mt-1 text-xl font-semibold ${
                    isSocketConnected
                      ? 'text-success-600 dark:text-success-400'
                      : 'text-error-600 dark:text-error-400'
                  }`}
                >
                  {isSocketConnected ? 'Connected' : 'Disconnected'}
                </p>
              </div>
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  isSocketConnected
                    ? 'bg-success-100 dark:bg-success-900/30'
                    : 'bg-error-100 dark:bg-error-900/30'
                }`}
              >
                <svg
                  className={`h-6 w-6 ${
                    isSocketConnected
                      ? 'text-success-600 dark:text-success-400'
                      : 'text-error-600 dark:text-error-400'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  isSocketConnected
                    ? 'bg-success-500 shadow-glow-success'
                    : 'bg-error-500 shadow-glow-error'
                }`}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {isSocketConnected ? 'Live data streaming' : 'Reconnecting...'}
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="card animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <p className="mb-4 text-sm font-medium text-slate-500 dark:text-slate-400">
              Quick Actions
            </p>
            <div className="space-y-2">
              <Link
                href="/contacts"
                className="btn btn-secondary w-full justify-start"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Manage Contacts
              </Link>
              <Link
                href="/auth"
                className="btn btn-secondary w-full justify-start"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
                QR Authentication
              </Link>
            </div>
          </div>
        </div>

        {/* Master Kill Switch */}
        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <KillSwitch />
        </div>

        {/* Recent Activity */}
        <div className="card animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          {/* Header with filters */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Recent Activity
            </h2>
            <div className="flex gap-2">
              {(['all', 'messages', 'pauses'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`
                    rounded-full px-3 py-1.5 text-xs font-medium transition-all
                    ${
                      activeFilter === filter
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    }
                  `}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Activity list */}
          {filteredActivity.length === 0 ? (
            <EmptyStateNoActivity />
          ) : (
            <div className="space-y-3">
              {filteredActivity.map((activity, index) => (
                <div
                  key={activity.id}
                  className="group flex items-center justify-between rounded-lg border border-slate-200 p-3 transition-all hover:border-slate-300 hover:shadow-soft dark:border-slate-700 dark:hover:border-slate-600"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex items-center gap-3">
                    {/* Activity icon */}
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        activity.type === 'message_sent'
                          ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                          : activity.type === 'message_received'
                            ? 'bg-success-100 text-success-600 dark:bg-success-900/30 dark:text-success-400'
                            : 'bg-warning-100 text-warning-600 dark:bg-warning-900/30 dark:text-warning-400'
                      }`}
                    >
                      {activity.type === 'message_sent' ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                          />
                        </svg>
                      ) : activity.type === 'message_received' ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                          />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      )}
                    </div>

                    {/* Activity details */}
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {activity.type === 'message_sent'
                          ? 'Message sent'
                          : activity.type === 'message_received'
                            ? 'Message received'
                            : activity.type === 'pause'
                              ? `Bot paused`
                              : 'Rate limit triggered'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {activity.contactName || activity.contactId}
                        {activity.details && ` - ${activity.details}`}
                      </p>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {formatRelativeTime(activity.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Getting Started */}
        <div
          className="mt-8 card animate-fade-in-up"
          style={{ animationDelay: '250ms' }}
        >
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            Getting Started
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                step: '1',
                title: 'Authenticate',
                description: 'Scan the QR code with WhatsApp to connect your account',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                ),
              },
              {
                step: '2',
                title: 'Enable Contacts',
                description: 'Choose which contacts should receive automated responses',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                ),
              },
              {
                step: '3',
                title: 'Monitor',
                description: 'Watch real-time activity and use the kill switch when needed',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                ),
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {item.icon}
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium text-primary-600 dark:text-primary-400">
                    Step {item.step}
                  </p>
                  <h4 className="font-medium text-slate-900 dark:text-white">{item.title}</h4>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
