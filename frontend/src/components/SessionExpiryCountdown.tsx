/**
 * Session Expiry Countdown Component
 * T101: Displays countdown until WhatsApp session expires and needs re-authentication
 */

'use client';

import { useState, useEffect } from 'react';
import { socketClient } from '@/lib/socket';
import { getErrorMessage } from '@/lib/errors';

interface SessionInfo {
  isActive: boolean;
  needsRefresh: boolean;
  timeRemaining: {
    hours: number;
    minutes: number;
    isExpiring: boolean;
  };
  state: string;
  createdAt: number | null;
  expiresAt: number | null;
}

interface Props {
  className?: string;
  compact?: boolean;
}

export default function SessionExpiryCountdown({ className = '', compact = false }: Props) {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if WhatsApp was already connected before component mounted
    const cachedStatus = socketClient.getLastConnectionStatus();
    const initialRetries = cachedStatus === 'ready' ? 5 : 2;
    loadSessionInfo(initialRetries);

    // Listen for session updates via Socket.io
    const socket = socketClient.getSocket();

    const handleSessionUpdate = (data: any) => {
      setSessionInfo({
        isActive: data.state === 'CONNECTED',
        needsRefresh: data.needsRefresh,
        timeRemaining: data.timeRemaining,
        state: data.state,
        createdAt: data.createdAt,
        expiresAt: data.estimatedExpiryAt,
      });
    };

    const handleExpiryWarning = (data: any) => {
      // Flash warning animation
      console.log('[SessionExpiry] Expiry warning received:', data);
    };

    const handleSessionExpired = (data: any) => {
      setSessionInfo((prev) =>
        prev
          ? {
              ...prev,
              isActive: false,
              needsRefresh: true,
              state: 'EXPIRED',
            }
          : null
      );
    };

    socket.on('session_update', handleSessionUpdate);
    socket.on('session_expiry_warning', handleExpiryWarning);
    socket.on('session_expired', handleSessionExpired);

    // Also listen for WhatsApp connection status changes
    const handleConnectionStatus = (data: {
      status: 'connected' | 'disconnected' | 'qr' | 'ready';
    }) => {
      console.log('[SessionExpiry] Connection status changed:', data.status);
      if (data.status === 'ready') {
        // WhatsApp just connected - refresh session info with more retries
        // (Gateway's sessionManager.handleReauthentication() may still be running)
        loadSessionInfo(5);
      } else if (data.status === 'disconnected') {
        // WhatsApp disconnected - update state immediately
        setSessionInfo((prev) =>
          prev
            ? {
                ...prev,
                isActive: false,
                state: 'DISCONNECTED',
              }
            : null
        );
      }
    };

    socketClient.onConnectionStatus(handleConnectionStatus);

    // Refresh periodically
    const interval = setInterval(loadSessionInfo, 60000); // Every minute

    return () => {
      socket.off('session_update', handleSessionUpdate);
      socket.off('session_expiry_warning', handleExpiryWarning);
      socket.off('session_expired', handleSessionExpired);
      socketClient.offConnectionStatus(handleConnectionStatus);
      clearInterval(interval);
    };
  }, []);

  async function loadSessionInfo(retries = 2) {
    try {
      const response = await fetch('/api/session');
      if (response.ok) {
        const data = await response.json();
        // If state is UNKNOWN and we have retries, wait and try again
        // Gateway's sessionManager may still be initializing
        if (data.state === 'unknown' && retries > 0) {
          console.log(`[SessionExpiry] State UNKNOWN, retrying (${retries} left)...`);
          setTimeout(() => loadSessionInfo(retries - 1), 800);
          return; // Don't set loading false yet
        }
        console.log('[SessionExpiry] Session info loaded:', data.state);
        setSessionInfo(data);
        setError(null);
        setIsLoading(false);
      } else if (retries > 0) {
        // Retry after short delay
        console.log(`[SessionExpiry] Request failed, retrying (${retries} left)...`);
        setTimeout(() => loadSessionInfo(retries - 1), 800);
        return; // Don't set loading false yet
      } else {
        // Set a default disconnected state on final failure
        setSessionInfo({
          isActive: false,
          needsRefresh: false,
          timeRemaining: { hours: 0, minutes: 0, isExpiring: false },
          state: 'DISCONNECTED',
          createdAt: null,
          expiresAt: null,
        });
        setIsLoading(false);
      }
    } catch (err) {
      if (retries > 0) {
        console.log(`[SessionExpiry] Error, retrying (${retries} left)...`);
        setTimeout(() => loadSessionInfo(retries - 1), 800);
        return; // Don't set loading false yet
      }
      console.error('[SessionExpiry] Error loading session info:', getErrorMessage(err));
      // Don't show error to user, just set disconnected state
      setSessionInfo({
        isActive: false,
        needsRefresh: false,
        timeRemaining: { hours: 0, minutes: 0, isExpiring: false },
        state: 'DISCONNECTED',
        createdAt: null,
        expiresAt: null,
      });
      setIsLoading(false);
    }
  }

  async function handleRefreshSession() {
    try {
      const response = await fetch('/api/session', { method: 'POST' });
      if (response.ok) {
        // Redirect to auth page for QR scan
        window.location.href = '/auth';
      } else {
        setError('Failed to initiate session refresh');
      }
    } catch (err) {
      console.error('[SessionExpiry] Error refreshing session:', getErrorMessage(err));
      setError('Failed to initiate session refresh');
    }
  }

  function formatTimeRemaining(): string {
    if (!sessionInfo?.timeRemaining) return '--';
    const { hours, minutes } = sessionInfo.timeRemaining;
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  }

  if (isLoading) {
    if (compact) {
      return (
        <div className={`animate-pulse ${className}`}>
          <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      );
    }
    return (
      <div className={`card animate-pulse ${className}`}>
        <div className="h-6 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="mt-4 h-12 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  if (!sessionInfo) {
    return null;
  }

  const { isActive, needsRefresh, timeRemaining, state } = sessionInfo;

  // Compact view (for header/status bar)
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div
          className={`h-2 w-2 rounded-full ${
            isActive
              ? needsRefresh
                ? 'bg-warning-500 animate-pulse'
                : 'bg-success-500'
              : 'bg-error-500'
          }`}
        />
        {isActive && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatTimeRemaining()}
          </span>
        )}
        {needsRefresh && (
          <button
            onClick={handleRefreshSession}
            className="text-xs text-warning-600 hover:text-warning-700 dark:text-warning-400"
          >
            Refresh
          </button>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div
      className={`card ${
        needsRefresh
          ? 'border-warning-200 bg-warning-50 dark:border-warning-900/50 dark:bg-warning-900/20'
          : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Session Status
          </h3>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${
                isActive
                  ? needsRefresh
                    ? 'text-warning-600 dark:text-warning-400'
                    : 'text-slate-900 dark:text-white'
                  : 'text-error-600 dark:text-error-400'
              }`}
            >
              {isActive ? formatTimeRemaining() : 'Expired'}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {isActive ? 'remaining' : ''}
            </span>
          </div>
        </div>

        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${
            isActive
              ? needsRefresh
                ? 'bg-warning-100 dark:bg-warning-900/30'
                : 'bg-success-100 dark:bg-success-900/30'
              : 'bg-error-100 dark:bg-error-900/30'
          }`}
        >
          {isActive ? (
            <svg
              className={`h-6 w-6 ${
                needsRefresh
                  ? 'text-warning-600 dark:text-warning-400'
                  : 'text-success-600 dark:text-success-400'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg
              className="h-6 w-6 text-error-600 dark:text-error-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Warning message when expiring soon */}
      {needsRefresh && (
        <div className="mt-4 flex items-center gap-2 text-sm text-warning-700 dark:text-warning-300">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          Session expiring soon. Refresh to avoid disconnection.
        </div>
      )}

      {/* Refresh button */}
      {(needsRefresh || !isActive) && (
        <button
          onClick={handleRefreshSession}
          className="mt-4 btn btn-primary w-full"
        >
          {isActive ? 'Refresh Session' : 'Re-authenticate'}
        </button>
      )}

      {/* State indicator */}
      <div className="mt-4 flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${
            isActive ? 'bg-success-500' : 'bg-error-500'
          }`}
        />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          State: {state}
        </span>
      </div>
    </div>
  );
}
