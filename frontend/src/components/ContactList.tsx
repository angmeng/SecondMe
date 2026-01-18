/**
 * Contact List Component
 * T109: Displays contacts with search, filter, and bot enable/disable toggles
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
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

type FilterType = 'all' | 'active' | 'paused';

interface ContactListProps {
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  isLoading: boolean;
}

export default function ContactList({ contacts, setContacts, isLoading }: ContactListProps) {
  const [error, setError] = useState<string | null>(null);
  const [loadingContactId, setLoadingContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');

  // Filter and search contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      // Apply search filter
      const matchesSearch =
        searchQuery === '' ||
        contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.id.toLowerCase().includes(searchQuery.toLowerCase());

      // Apply status filter
      const matchesFilter =
        filterType === 'all' ||
        (filterType === 'active' && !contact.isPaused) ||
        (filterType === 'paused' && contact.isPaused);

      return matchesSearch && matchesFilter;
    });
  }, [contacts, searchQuery, filterType]);

  // Statistics for filter badges
  const stats = useMemo(() => ({
    total: contacts.length,
    active: contacts.filter((c) => !c.isPaused).length,
    paused: contacts.filter((c) => c.isPaused).length,
  }), [contacts]);

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

  // Empty state (no contacts at all)
  if (contacts.length === 0) {
    return <EmptyStateNoContacts />;
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            onClick={() => setFilterType('all')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            All
            <span className="ml-1.5 text-xs text-slate-400">({stats.total})</span>
          </button>
          <button
            onClick={() => setFilterType('active')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filterType === 'active'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Active
            <span className="ml-1.5 text-xs text-success-500">({stats.active})</span>
          </button>
          <button
            onClick={() => setFilterType('paused')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filterType === 'paused'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Paused
            <span className="ml-1.5 text-xs text-error-500">({stats.paused})</span>
          </button>
        </div>
      </div>

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

      {/* No results state */}
      {filteredContacts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <svg
            className="mb-3 h-12 w-12 text-slate-300 dark:text-slate-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No contacts found</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {searchQuery
              ? `No contacts matching "${searchQuery}"`
              : `No ${filterType} contacts`}
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setFilterType('all');
            }}
            className="mt-3 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Contact grid */}
      {filteredContacts.length > 0 && (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredContacts.map((contact, index) => (
          <div
            key={contact.id}
            className="card card-interactive group animate-fade-in-up"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start justify-between">
              {/* Contact info - clickable to view details */}
              <Link
                href={`/contacts/${contact.id}`}
                className="flex flex-1 items-center gap-3 rounded-lg transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 -m-2 p-2"
              >
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
              </Link>

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

            {/* Action hint - always visible on mobile, hover-only on larger screens */}
            <div className="mt-3 border-t border-slate-100 pt-3 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 dark:border-slate-700">
              <p className="text-xs text-slate-400">
                Click to view details
                <span className="mx-1.5">·</span>
                <span className="text-slate-300 dark:text-slate-500">
                  {contact.isPaused ? 'Resume' : 'Pause'} with button
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Results count */}
      {filteredContacts.length > 0 && filteredContacts.length !== contacts.length && (
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          Showing {filteredContacts.length} of {contacts.length} contacts
        </p>
      )}
    </div>
  );
}
