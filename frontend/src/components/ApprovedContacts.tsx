/**
 * Approved Contacts Component
 * Displays and manages approved contacts with tier editing and revoke actions
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { getErrorMessage } from '@/lib/errors';
import Avatar from '@/components/ui/Avatar';
import { SkeletonCard } from '@/components/ui/Skeleton';
import type { ApprovedContact, ContactTier } from '@secondme/shared-types';

type FilterTier = 'all' | ContactTier;

interface ApprovedContactsProps {
  refreshTrigger?: number; // Increment to trigger refresh
}

export default function ApprovedContacts({ refreshTrigger }: ApprovedContactsProps) {
  const [contacts, setContacts] = useState<ApprovedContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState<FilterTier>('all');
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch approved contacts
  useEffect(() => {
    fetchContacts();
  }, [refreshTrigger]);

  async function fetchContacts() {
    try {
      setIsLoading(true);
      const response = await fetch('/api/pairing/approved');
      const data = await response.json();

      if (data.success) {
        setContacts(data.contacts);
      } else {
        setError(data.error || 'Failed to fetch contacts');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  // Filter and search contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      // Search filter
      const matchesSearch =
        searchQuery === '' ||
        (contact.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        contact.phoneNumber.includes(searchQuery) ||
        contact.contactId.toLowerCase().includes(searchQuery.toLowerCase());

      // Tier filter
      const matchesTier = filterTier === 'all' || contact.tier === filterTier;

      return matchesSearch && matchesTier;
    });
  }, [contacts, searchQuery, filterTier]);

  // Statistics for filter badges
  const stats = useMemo(
    () => ({
      total: contacts.length,
      trusted: contacts.filter((c) => c.tier === 'trusted').length,
      standard: contacts.filter((c) => c.tier === 'standard').length,
      restricted: contacts.filter((c) => c.tier === 'restricted').length,
    }),
    [contacts]
  );

  async function handleUpdateTier(contactId: string, tier: ContactTier) {
    setProcessingId(contactId);

    try {
      const response = await fetch(`/api/pairing/approved/${encodeURIComponent(contactId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });

      const data = await response.json();

      if (data.success) {
        setContacts((prev) =>
          prev.map((c) => (c.contactId === contactId ? { ...c, tier } : c))
        );
        toast({
          title: 'Tier Updated',
          description: `Contact tier changed to ${tier}`,
          variant: 'success',
        });
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

  async function handleRevoke(contactId: string) {
    setProcessingId(contactId);
    setConfirmRevoke(null);

    try {
      const response = await fetch(`/api/pairing/approved/${encodeURIComponent(contactId)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setContacts((prev) => prev.filter((c) => c.contactId !== contactId));
        toast({
          title: 'Access Revoked',
          description: 'Contact will need to re-pair to chat with the bot',
          variant: 'warning',
        });
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

  // Format date for display
  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  // Get tier badge color
  function getTierBadgeClass(tier: ContactTier): string {
    switch (tier) {
      case 'trusted':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'standard':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'restricted':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
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
          onClick={fetchContacts}
          className="mt-2 text-sm text-red-600 underline hover:no-underline dark:text-red-400"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 pl-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
          <svg
            className="absolute left-3 top-2.5 h-5 w-5 text-slate-400"
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
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2">
          {(['all', 'trusted', 'standard', 'restricted'] as const).map((tier) => (
            <button
              key={tier}
              onClick={() => setFilterTier(tier)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                filterTier === tier
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
              <span className="ml-1 text-xs opacity-70">
                ({tier === 'all' ? stats.total : stats[tier as ContactTier]})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Contact List */}
      {filteredContacts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <p className="text-slate-600 dark:text-slate-300">
            {searchQuery || filterTier !== 'all'
              ? 'No contacts match your search or filter'
              : 'No approved contacts yet'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {filteredContacts.map((contact) => (
            <div key={contact.contactId} className="flex items-center justify-between p-4">
              {/* Contact Info */}
              <div className="flex items-center gap-3">
                <Avatar name={contact.displayName || contact.phoneNumber} size="md" />
                <div>
                  <h3 className="font-medium text-slate-900 dark:text-slate-100">
                    {contact.displayName || contact.phoneNumber}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>+{contact.phoneNumber}</span>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <span>Approved {formatDate(contact.approvedAt)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                {/* Tier Selector */}
                <select
                  value={contact.tier}
                  onChange={(e) => handleUpdateTier(contact.contactId, e.target.value as ContactTier)}
                  disabled={processingId === contact.contactId}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${getTierBadgeClass(contact.tier)} border-0 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="trusted">Trusted</option>
                  <option value="standard">Standard</option>
                  <option value="restricted">Restricted</option>
                </select>

                {/* Revoke Button */}
                {confirmRevoke === contact.contactId ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRevoke(contact.contactId)}
                      disabled={processingId === contact.contactId}
                      className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmRevoke(null)}
                      className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRevoke(contact.contactId)}
                    disabled={processingId === contact.contactId}
                    className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    title="Revoke access"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer Stats */}
      <div className="text-center text-sm text-slate-500 dark:text-slate-400">
        Showing {filteredContacts.length} of {contacts.length} approved contacts
      </div>
    </div>
  );
}
