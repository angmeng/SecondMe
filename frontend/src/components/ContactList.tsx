/**
 * Contact List Component
 * Displays contacts with bot enable/disable toggles
 */

'use client';

import { useState, useEffect } from 'react';
import { socketClient } from '@/lib/socket';

interface Contact {
  id: string;
  name: string;
  isPaused: boolean;
  pauseReason?: string;
  expiresAt?: number;
}

export default function ContactList() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to pause updates
    socketClient.onPauseUpdate((data) => {
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
    });

    // Load contacts (placeholder - will be implemented with real WhatsApp contact fetching)
    loadPlaceholderContacts();
  }, []);

  function loadPlaceholderContacts() {
    // Placeholder contacts for MVP
    // In production, this would fetch from WhatsApp via Gateway
    const placeholderContacts: Contact[] = [
      {
        id: '1234567890@c.us',
        name: 'John Doe',
        isPaused: false,
      },
      {
        id: '0987654321@c.us',
        name: 'Jane Smith',
        isPaused: false,
      },
      {
        id: '5555555555@c.us',
        name: 'Test Contact',
        isPaused: true,
        pauseReason: 'manual',
      },
    ];

    setContacts(placeholderContacts);
    setIsLoading(false);
  }

  async function toggleContact(contactId: string, currentlyPaused: boolean) {
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
    }
  }

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center py-12">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-primary-600"></div>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-gray-600 dark:text-gray-400">No contacts found</p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
          Make sure WhatsApp is connected
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-error bg-error-light/10 p-4">
          <p className="text-sm text-error-dark">{error}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {contacts.map((contact) => (
          <div key={contact.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {contact.name}
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                  {contact.id.replace('@c.us', '')}
                </p>

                {/* Status Badge */}
                <div className="mt-2">
                  {contact.isPaused ? (
                    <span className="badge badge-error">
                      Paused
                      {contact.pauseReason && ` (${contact.pauseReason})`}
                    </span>
                  ) : (
                    <span className="badge badge-success">Active</span>
                  )}
                </div>

                {/* Expiration */}
                {contact.expiresAt && contact.expiresAt > Date.now() && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                    Expires:{' '}
                    {new Date(contact.expiresAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>

              {/* Toggle Button */}
              <button
                onClick={() => toggleContact(contact.id, contact.isPaused)}
                className={`ml-4 rounded-full p-2 transition-colors ${
                  contact.isPaused
                    ? 'bg-error/10 text-error hover:bg-error/20'
                    : 'bg-success/10 text-success hover:bg-success/20'
                }`}
                aria-label={contact.isPaused ? 'Resume bot' : 'Pause bot'}
              >
                {contact.isPaused ? (
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
          </div>
        ))}
      </div>
    </div>
  );
}
