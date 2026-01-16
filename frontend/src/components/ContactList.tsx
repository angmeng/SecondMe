/**
 * Contact List Component
 * Displays contacts with bot enable/disable toggles and enhanced UI
 */

'use client';

import { useState, useEffect } from 'react';
import { socketClient } from '@/lib/socket';
import Avatar from '@/components/ui/Avatar';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyStateNoContacts } from '@/components/ui/EmptyState';

export interface Contact {
  id: string;
  name: string;
  isPaused: boolean;
  pauseReason?: string;
  expiresAt?: number;
}

interface ContactListProps {
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  isLoading: boolean;
}

export default function ContactList({ contacts, setContacts, isLoading }: ContactListProps) {
  const [error, setError] = useState<string | null>(null);
  const [loadingContactId, setLoadingContactId] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to pause updates for real-time state sync
    const handlePauseUpdate = (data: {
      contactId: string;
      action: 'pause' | 'resume';
      reason?: string;
      expiresAt?: number;
    }) => {
      console.log('[ContactList] Pause update:', data);

      setContacts((prev) =>
        prev.map((contact) => {
          if (contact.id === data.contactId) {
            return {
              ...contact,
              isPaused: data.action === 'pause',
              pauseReason: data.reason,
              expiresAt: data.expiresAt,
            };
          }
          return contact;
        })
      );
    };

    socketClient.onPauseUpdate(handlePauseUpdate);

    return () => {
      socketClient.offPauseUpdate(handlePauseUpdate);
    };
  }, [setContacts]);

  async function toggleContact(contactId: string, currentlyPaused: boolean) {
    setLoadingContactId(contactId);

    try {
      if (currentlyPaused) {
        // Resume (clear pause)
        const response = await fetch(`/api/pause?contactId=${contactId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to resume contact');
        }

        setContacts((prev) =>
          prev.map((c) =>
            c.id === contactId ? { ...c, isPaused: false, pauseReason: undefined } : c
          )
        );
      } else {
        // Pause
        const response = await fetch('/api/pause', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contactId,
            duration: 3600, // 1 hour
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to pause contact');
        }

        const data = await response.json();

        setContacts((prev) =>
          prev.map((c) =>
            c.id === contactId
              ? { ...c, isPaused: true, pauseReason: 'manual', expiresAt: data.expiresAt }
              : c
          )
        );
      }
    } catch (err: any) {
      console.error('[ContactList] Error toggling contact:', err);
      setError(err.message || 'Failed to toggle contact');
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoadingContactId(null);
    }
  }

  function formatTimeRemaining(expiresAt: number): string {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return 'Expired';

    const minutes = Math.floor(remaining / 60000);
    if (minutes < 60) return `${minutes}m remaining`;

    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m remaining`;
  }

  // Loading state with skeleton
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (contacts.length === 0) {
    return <EmptyStateNoContacts />;
  }

  return (
    <div className="space-y-4">
      {/* Error notification */}
      {error && (
        <div className="animate-fade-in rounded-lg border border-error-200 bg-error-50 p-4 dark:border-error-900/50 dark:bg-error-900/20">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-error-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-error-700 dark:text-error-300">{error}</p>
          </div>
        </div>
      )}

      {/* Contact grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {contacts.map((contact, index) => (
          <div
            key={contact.id}
            className="card card-interactive group animate-fade-in-up"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start justify-between">
              {/* Contact info */}
              <div className="flex items-center gap-3">
                <Avatar
                  name={contact.name}
                  size="lg"
                  status={contact.isPaused ? 'offline' : 'online'}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-slate-900 dark:text-white">
                    {contact.name}
                  </h3>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {contact.id.replace('@c.us', '')}
                  </p>

                  {/* Status Badge */}
                  <div className="mt-2">
                    {contact.isPaused ? (
                      <span className="badge badge-error badge-dot">
                        Paused
                        {contact.pauseReason && contact.pauseReason !== 'manual' && (
                          <span className="ml-1 opacity-70">({contact.pauseReason})</span>
                        )}
                      </span>
                    ) : (
                      <span className="badge badge-success badge-dot">Active</span>
                    )}
                  </div>

                  {/* Expiration countdown */}
                  {contact.expiresAt && contact.expiresAt > Date.now() && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {formatTimeRemaining(contact.expiresAt)}
                    </p>
                  )}
                </div>
              </div>

              {/* Toggle Button */}
              <button
                onClick={() => toggleContact(contact.id, contact.isPaused)}
                disabled={loadingContactId === contact.id}
                className={`
                  flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full
                  transition-all duration-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
                  ${
                    contact.isPaused
                      ? 'bg-error-100 text-error-600 hover:bg-error-200 focus-visible:ring-error-500 dark:bg-error-900/30 dark:text-error-400 dark:hover:bg-error-900/50'
                      : 'bg-success-100 text-success-600 hover:bg-success-200 focus-visible:ring-success-500 dark:bg-success-900/30 dark:text-success-400 dark:hover:bg-success-900/50'
                  }
                  ${loadingContactId === contact.id ? 'opacity-50 cursor-wait' : ''}
                `}
                aria-label={contact.isPaused ? 'Resume bot for this contact' : 'Pause bot for this contact'}
              >
                {loadingContactId === contact.id ? (
                  <svg
                    className="h-5 w-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : contact.isPaused ? (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
              </button>
            </div>

            {/* Hover action hint */}
            <div className="mt-3 border-t border-slate-100 pt-3 opacity-0 transition-opacity group-hover:opacity-100 dark:border-slate-700">
              <p className="text-xs text-slate-400">
                {contact.isPaused
                  ? 'Click to resume automated responses'
                  : 'Click to pause automated responses for 1 hour'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
