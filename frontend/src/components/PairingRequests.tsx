/**
 * Pairing Requests Component
 * Displays pending contact requests with approve/deny actions
 *
 * Contact Approval Mode:
 * - Shows contacts who have messaged the bot but are not yet approved
 * - Admin can approve (with tier selection) or deny
 * - No verification codes displayed (simplified from pairing mode)
 */

'use client';

import { useState, useEffect } from 'react';
import { socketClient } from '@/lib/socket';
import { useToast } from '@/contexts/ToastContext';
import { getErrorMessage } from '@/lib/errors';
import Avatar from '@/components/ui/Avatar';
import ChannelBadge from '@/components/ui/ChannelBadge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import type { PairingRequest, ContactTier } from '@secondme/shared-types';

interface PairingRequestsProps {
  onRequestProcessed?: () => void;
}

export default function PairingRequests({ onRequestProcessed }: PairingRequestsProps) {
  const [requests, setRequests] = useState<PairingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showTierSelector, setShowTierSelector] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch pending requests
  useEffect(() => {
    fetchRequests();
  }, []);

  // Subscribe to real-time pairing events
  useEffect(() => {
    const handlePairingRequest = (data: {
      contactId: string;
      displayName?: string;
      phoneNumber: string;
      firstMessage?: string;
      timestamp: number;
    }) => {
      console.log('[PairingRequests] New pairing request:', data);
      // Refresh the list to get full request data
      fetchRequests();
    };

    const handlePairingApproved = (data: { contactId: string }) => {
      console.log('[PairingRequests] Pairing approved:', data);
      setRequests((prev) => prev.filter((r) => r.contactId !== data.contactId));
    };

    // Subscribe to socket events
    const socket = socketClient.getSocket();
    socket.on('pairing_request', handlePairingRequest);
    socket.on('pairing_approved', handlePairingApproved);

    return () => {
      socket.off('pairing_request', handlePairingRequest);
      socket.off('pairing_approved', handlePairingApproved);
    };
  }, []);

  async function fetchRequests() {
    try {
      setIsLoading(true);
      const response = await fetch('/api/pairing');
      const data = await response.json();

      if (data.success) {
        setRequests(data.requests);
      } else {
        setError(data.error || 'Failed to fetch requests');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove(contactId: string, tier: ContactTier = 'standard') {
    setProcessingId(contactId);
    setShowTierSelector(null);

    try {
      const response = await fetch(`/api/pairing/${encodeURIComponent(contactId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });

      const data = await response.json();

      if (data.success) {
        setRequests((prev) => prev.filter((r) => r.contactId !== contactId));
        toast({
          title: 'Contact Approved',
          description: `Contact has been approved with ${tier} tier`,
          variant: 'success',
        });
        onRequestProcessed?.();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: getErrorMessage(err),
        variant: 'error',
      });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleDeny(contactId: string) {
    setProcessingId(contactId);

    try {
      const response = await fetch(`/api/pairing/${encodeURIComponent(contactId)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setRequests((prev) => prev.filter((r) => r.contactId !== contactId));
        toast({
          title: 'Contact Denied',
          description: 'Contact has been denied and placed in 24h cooldown',
          variant: 'warning',
        });
        onRequestProcessed?.();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: getErrorMessage(err),
        variant: 'error',
      });
    } finally {
      setProcessingId(null);
    }
  }

  // Format time since request
  function getTimeSince(requestedAt: number): string {
    const now = Date.now();
    const diff = now - requestedAt;

    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // Format phone number for display
  function formatPhoneNumber(contactId: string): string {
    const phone = contactId.replace('@c.us', '').replace('@s.whatsapp.net', '');
    // Format as +XX XXX XXX XXXX
    if (phone.length >= 10) {
      return `+${phone.slice(0, -10)} ${phone.slice(-10, -7)} ${phone.slice(-7, -4)} ${phone.slice(-4)}`;
    }
    return `+${phone}`;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={fetchRequests}
          className="mt-2 text-sm text-red-600 underline hover:no-underline dark:text-red-400"
        >
          Try again
        </button>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-slate-600 dark:text-slate-300">No pending contact requests</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          New contacts will appear here when they message the bot
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <div
          key={request.contactId}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="flex items-start justify-between gap-4">
            {/* Contact Info */}
            <div className="flex items-center gap-3">
              <Avatar name={request.displayName || request.phoneNumber} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-slate-900 dark:text-slate-100">
                    {request.displayName || 'Unknown'}
                  </h3>
                  <ChannelBadge channelId={request.channelId} />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {formatPhoneNumber(request.contactId)}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {getTimeSince(request.requestedAt)}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {showTierSelector === request.contactId ? (
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700"
                    defaultValue="standard"
                    onChange={(e) => handleApprove(request.contactId, e.target.value as ContactTier)}
                    disabled={processingId === request.contactId}
                  >
                    <option value="trusted">Trusted</option>
                    <option value="standard">Standard</option>
                    <option value="restricted">Restricted</option>
                  </select>
                  <button
                    onClick={() => setShowTierSelector(null)}
                    className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowTierSelector(request.contactId)}
                    disabled={processingId === request.contactId}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    {processingId === request.contactId ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleDeny(request.contactId)}
                    disabled={processingId === request.contactId}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Deny
                  </button>
                </>
              )}
            </div>
          </div>

          {/* First Message Preview (if available) */}
          {request.firstMessage && (
            <div className="mt-3 rounded-md bg-slate-50 p-2 dark:bg-slate-700/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">First message:</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                {request.firstMessage}
              </p>
            </div>
          )}
        </div>
      ))}

      {/* Bulk Approve Button */}
      {requests.length > 1 && (
        <div className="flex justify-end pt-2">
          <button
            onClick={() => {
              // Approve all with standard tier
              requests.forEach((r) => handleApprove(r.contactId, 'standard'));
            }}
            className="text-sm text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
          >
            Approve All ({requests.length})
          </button>
        </div>
      )}
    </div>
  );
}
