/**
 * Channel Status Grid Component
 * Grid container for channel cards with real-time Socket.io updates
 */

'use client';

import { useEffect, useState } from 'react';
import ChannelStatusCard from './ChannelStatusCard';
import { socketClient } from '@/lib/socket';
import { useToast } from '@/contexts/ToastContext';
import type { ManagedChannelInfo } from '@secondme/shared-types';

export default function ChannelStatusGrid() {
  const [channels, setChannels] = useState<ManagedChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch initial state
  useEffect(() => {
    fetch('/api/channels')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setChannels(data.channels || []);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('[ChannelStatusGrid] Error fetching channels:', err);
        setError('Failed to load channels');
        setLoading(false);
      });
  }, []);

  // Listen for real-time updates
  useEffect(() => {
    const socket = socketClient.getSocket();

    const handleStatus = (data: { channels: ManagedChannelInfo[]; timestamp: number }) => {
      setChannels(data.channels);
      setTogglingId(null); // Clear toggling state on update
      setError(null); // Clear any previous errors on successful update
    };

    socket.on('channel_manager_status', handleStatus);

    return () => {
      socket.off('channel_manager_status', handleStatus);
    };
  }, []);

  // Toggle channel enabled state
  const handleToggle = async (channelId: string, enabled: boolean) => {
    setTogglingId(channelId);

    try {
      const action = enabled ? 'enable' : 'disable';
      const response = await fetch(`/api/channels/${channelId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[ChannelStatusGrid] Toggle failed:', data.error);
        toast({
          title: `Failed to ${action} channel`,
          description: data.error || 'An error occurred',
          variant: 'error',
        });
        setTogglingId(null);
        return;
      }

      // Success toast - status update will come via socket.io
      toast({
        title: `Channel ${action}d`,
        description: `${channelId} has been ${action}d`,
        variant: 'success',
      });
    } catch (err) {
      console.error('[ChannelStatusGrid] Error toggling channel:', err);
      toast({
        title: 'Connection error',
        description: 'Could not reach the server',
        variant: 'error',
      });
      setTogglingId(null);
    }
  };

  // Retry fetching channels
  const handleRetry = () => {
    setError(null);
    setLoading(true);
    fetch('/api/channels')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setChannels(data.channels || []);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('[ChannelStatusGrid] Error fetching channels:', err);
        setError('Failed to load channels');
        setLoading(false);
      });
  };

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="card animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-5 w-24 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="mt-3 h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-error-200 dark:border-error-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-error-100 dark:bg-error-900/30">
              <svg
                className="h-5 w-5 text-error-600 dark:text-error-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-white">Unable to load channels</p>
              <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
            </div>
          </div>
          <button
            onClick={handleRetry}
            className="btn btn-secondary text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="card text-center text-slate-500 dark:text-slate-400">
        No channels configured
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {channels.map((channel) => (
        <ChannelStatusCard
          key={channel.id}
          channel={channel}
          onToggle={handleToggle}
          isToggling={togglingId === channel.id}
        />
      ))}
    </div>
  );
}
