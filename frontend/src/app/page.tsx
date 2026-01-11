/**
 * Dashboard Home Page
 * Main control panel for SecondMe Personal AI Clone
 */

'use client';

import { useEffect, useState } from 'react';
import { socketClient } from '@/lib/socket';
import KillSwitch from '@/components/KillSwitch';
import Link from 'next/link';

type ConnectionStatus = 'disconnected' | 'qr' | 'authenticated' | 'ready';

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

  useEffect(() => {
    // Get socket instance
    const socket = socketClient.getSocket();

    // Track socket connection
    setIsSocketConnected(socket.connected);

    // Subscribe to connection status
    socketClient.onConnectionStatus((data) => {
      console.log('[Dashboard] Connection status:', data.status);
      setConnectionStatus(data.status);
    });

    // Subscribe to message events
    socketClient.onMessageStatus((data) => {
      addActivity({
        id: data.messageId,
        type: data.status === 'sent' ? 'message_sent' : 'message_received',
        contactId: data.messageId.split('@')[0],
        timestamp: data.timestamp,
      });
    });

    // Subscribe to pause events
    socketClient.onPauseUpdate((data) => {
      addActivity({
        id: `pause-${Date.now()}`,
        type: 'pause',
        contactId: data.contactId,
        timestamp: Date.now(),
        details: data.reason || 'manual',
      });
    });

    // Cleanup
    return () => {
      // Socket stays connected, just cleanup
    };
  }, []);

  function addActivity(activity: RecentActivity) {
    setRecentActivity((prev) => [activity, ...prev].slice(0, 10)); // Keep last 10
  }

  function getStatusColor(status: ConnectionStatus): string {
    switch (status) {
      case 'ready':
        return 'bg-success text-white';
      case 'authenticated':
        return 'bg-warning text-white';
      case 'qr':
        return 'bg-warning text-white';
      case 'disconnected':
      default:
        return 'bg-error text-white';
    }
  }

  function getStatusText(status: ConnectionStatus): string {
    switch (status) {
      case 'ready':
        return 'Connected';
      case 'authenticated':
        return 'Authenticating...';
      case 'qr':
        return 'Awaiting QR Scan';
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            SecondMe Dashboard
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Personal AI Clone Control Panel
          </p>
        </div>

        {/* Status Grid */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* WhatsApp Connection Status */}
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  WhatsApp Status
                </p>
                <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  {getStatusText(connectionStatus)}
                </p>
              </div>
              <div className={`rounded-full p-3 ${getStatusColor(connectionStatus)}`}>
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
            </div>
            {connectionStatus !== 'ready' && (
              <div className="mt-4">
                <Link href="/auth" className="btn-primary w-full text-center">
                  Authenticate WhatsApp
                </Link>
              </div>
            )}
          </div>

          {/* Socket.io Connection */}
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Real-time Updates
                </p>
                <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  {isSocketConnected ? 'Connected' : 'Disconnected'}
                </p>
              </div>
              <div
                className={`rounded-full p-3 ${
                  isSocketConnected ? 'bg-success text-white' : 'bg-error text-white'
                }`}
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="card">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Quick Actions</p>
            <div className="mt-4 space-y-2">
              <Link href="/contacts" className="btn-secondary block w-full text-center">
                Manage Contacts
              </Link>
              <Link href="/auth" className="btn-secondary block w-full text-center">
                QR Authentication
              </Link>
            </div>
          </div>
        </div>

        {/* Master Kill Switch */}
        <div className="mb-8">
          <KillSwitch />
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Recent Activity
          </h2>
          <div className="mt-4">
            {recentActivity.length === 0 ? (
              <p className="text-center text-sm text-gray-500 dark:text-gray-500">
                No recent activity
              </p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="flex items-center space-x-3">
                      {/* Icon */}
                      <div
                        className={`rounded-full p-2 ${
                          activity.type === 'message_sent'
                            ? 'bg-primary-100 text-primary-600'
                            : activity.type === 'message_received'
                              ? 'bg-success-light text-success-dark'
                              : 'bg-warning-light text-warning-dark'
                        }`}
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                          />
                        </svg>
                      </div>

                      {/* Details */}
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {activity.type === 'message_sent'
                            ? 'Message sent'
                            : activity.type === 'message_received'
                              ? 'Message received'
                              : activity.type === 'pause'
                                ? `Bot paused (${activity.details})`
                                : 'Rate limit triggered'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          {activity.contactName || activity.contactId}
                        </p>
                      </div>
                    </div>

                    {/* Timestamp */}
                    <span className="text-xs text-gray-500 dark:text-gray-500">
                      {new Date(activity.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Getting Started
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">1. Authenticate</h4>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Scan the QR code with WhatsApp to connect your account
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">2. Enable Contacts</h4>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Choose which contacts should receive automated responses
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">3. Monitor</h4>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Watch real-time activity and use the kill switch when needed
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
