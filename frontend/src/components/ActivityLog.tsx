/**
 * Activity Log Component
 * T107: Real-time activity feed showing bot actions and events
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { socketClient } from '@/lib/socket';
import type {
  MessageReceivedEvent,
  MessageSentEvent,
  PauseUpdateEvent,
  RateLimitEvent,
  SessionExpiryWarningEvent,
  SocketErrorEvent,
} from '@/lib/socket-types';

export interface ActivityLogEntry {
  id: string;
  type:
    | 'message_received'
    | 'message_sent'
    | 'pause'
    | 'resume'
    | 'rate_limit'
    | 'error'
    | 'sleep_start'
    | 'sleep_end'
    | 'session';
  contactId?: string;
  contactName?: string;
  timestamp: number;
  details?: string;
  preview?: string;
}

interface Props {
  className?: string;
  maxEntries?: number;
  showTimestamps?: boolean;
  autoScroll?: boolean;
  filter?: 'all' | 'messages' | 'events' | 'errors';
}

export default function ActivityLog({
  className = '',
  maxEntries = 50,
  showTimestamps = true,
  autoScroll = true,
  filter = 'all',
}: Props) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = socketClient.getSocket();

    const handleMessageReceived = (data: MessageReceivedEvent) => {
      addEntry({
        id: `recv-${Date.now()}`,
        type: 'message_received',
        contactId: data.contactId,
        contactName: data.contactName,
        timestamp: data.timestamp || Date.now(),
        preview: data.preview || data.content?.substring(0, 50),
      });
    };

    const handleMessageSent = (data: MessageSentEvent) => {
      addEntry({
        id: `sent-${data.messageId || Date.now()}`,
        type: 'message_sent',
        contactId: data.contactId,
        timestamp: data.timestamp || Date.now(),
        details: data.delayMs ? `${data.delayMs}ms delay` : undefined,
      });
    };

    const handlePauseUpdate = (data: PauseUpdateEvent) => {
      addEntry({
        id: `pause-${Date.now()}`,
        type: data.action === 'pause' ? 'pause' : 'resume',
        contactId: data.contactId,
        timestamp: Date.now(),
        details: data.reason,
      });
    };

    const handleRateLimit = (data: RateLimitEvent) => {
      addEntry({
        id: `rate-${Date.now()}`,
        type: 'rate_limit',
        contactId: data.contactId,
        timestamp: Date.now(),
        details: 'Auto-paused due to rate limit',
      });
    };

    const handleError = (data: SocketErrorEvent) => {
      addEntry({
        id: `error-${Date.now()}`,
        type: 'error',
        timestamp: Date.now(),
        details: data.message || data.error,
      });
    };

    const handleSessionUpdate = (data: SessionExpiryWarningEvent) => {
      if (data.needsRefresh) {
        addEntry({
          id: `session-${Date.now()}`,
          type: 'session',
          timestamp: Date.now(),
          details: 'Session expiring soon',
        });
      }
    };

    // Subscribe to events
    socket.on('message_received', handleMessageReceived);
    socket.on('message_sent', handleMessageSent);
    socket.on('pause_update', handlePauseUpdate);
    socket.on('rate_limit_triggered', handleRateLimit);
    socket.on('error', handleError);
    socket.on('session_expiry_warning', handleSessionUpdate);

    return () => {
      socket.off('message_received', handleMessageReceived);
      socket.off('message_sent', handleMessageSent);
      socket.off('pause_update', handlePauseUpdate);
      socket.off('rate_limit_triggered', handleRateLimit);
      socket.off('error', handleError);
      socket.off('session_expiry_warning', handleSessionUpdate);
    };
  }, []);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && !isPaused && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, autoScroll, isPaused]);

  function addEntry(entry: ActivityLogEntry) {
    setEntries((prev) => {
      const newEntries = [entry, ...prev].slice(0, maxEntries);
      return newEntries;
    });
  }

  function getEntryIcon(type: ActivityLogEntry['type']) {
    switch (type) {
      case 'message_received':
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        );
      case 'message_sent':
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
          />
        );
      case 'pause':
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        );
      case 'resume':
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
        );
      case 'rate_limit':
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        );
      case 'error':
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        );
      case 'session':
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        );
      default:
        return (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        );
    }
  }

  function getEntryColors(type: ActivityLogEntry['type']) {
    switch (type) {
      case 'message_received':
        return {
          icon: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-100 dark:bg-blue-900/30',
        };
      case 'message_sent':
        return {
          icon: 'text-green-600 dark:text-green-400',
          bg: 'bg-green-100 dark:bg-green-900/30',
        };
      case 'pause':
        return {
          icon: 'text-warning-600 dark:text-warning-400',
          bg: 'bg-warning-100 dark:bg-warning-900/30',
        };
      case 'resume':
        return {
          icon: 'text-success-600 dark:text-success-400',
          bg: 'bg-success-100 dark:bg-success-900/30',
        };
      case 'rate_limit':
        return {
          icon: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-100 dark:bg-amber-900/30',
        };
      case 'error':
        return {
          icon: 'text-error-600 dark:text-error-400',
          bg: 'bg-error-100 dark:bg-error-900/30',
        };
      default:
        return {
          icon: 'text-slate-600 dark:text-slate-400',
          bg: 'bg-slate-100 dark:bg-slate-700/30',
        };
    }
  }

  function getEntryLabel(type: ActivityLogEntry['type']): string {
    switch (type) {
      case 'message_received':
        return 'Message received';
      case 'message_sent':
        return 'Message sent';
      case 'pause':
        return 'Bot paused';
      case 'resume':
        return 'Bot resumed';
      case 'rate_limit':
        return 'Rate limit';
      case 'error':
        return 'Error';
      case 'session':
        return 'Session warning';
      default:
        return 'Event';
    }
  }

  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Apply filter
  const filteredEntries = entries.filter((entry) => {
    if (filter === 'all') return true;
    if (filter === 'messages') return entry.type === 'message_received' || entry.type === 'message_sent';
    if (filter === 'events') return ['pause', 'resume', 'rate_limit', 'session'].includes(entry.type);
    if (filter === 'errors') return entry.type === 'error';
    return true;
  });

  return (
    <div className={`card flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Activity Log</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1.5 rounded-lg transition-colors ${
              isPaused
                ? 'bg-warning-100 text-warning-600 dark:bg-warning-900/30'
                : 'hover:bg-slate-100 text-slate-500 dark:hover:bg-slate-700'
            }`}
            title={isPaused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isPaused ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              )}
            </svg>
          </button>
          <button
            onClick={() => setEntries([])}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 dark:hover:bg-slate-700 transition-colors"
            title="Clear log"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Entries */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-2 max-h-96"
      >
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500 dark:text-slate-400">
            <svg className="h-10 w-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="text-sm">No activity yet</p>
            <p className="text-xs">Events will appear here as they happen</p>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const colors = getEntryColors(entry.type);
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
                  <svg className={`h-4 w-4 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {getEntryIcon(entry.type)}
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {getEntryLabel(entry.type)}
                    </p>
                    {showTimestamps && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    )}
                  </div>
                  {(entry.contactName || entry.contactId || entry.details) && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {entry.contactName || entry.contactId}
                      {entry.details && ` - ${entry.details}`}
                    </p>
                  )}
                  {entry.preview && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5 italic">
                      "{entry.preview}..."
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer with count */}
      {filteredEntries.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {filteredEntries.length} entries
          </span>
          {isPaused && (
            <span className="text-xs text-warning-600 dark:text-warning-400">
              Auto-scroll paused
            </span>
          )}
        </div>
      )}
    </div>
  );
}
