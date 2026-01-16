/**
 * Contacts List Page
 * Displays all WhatsApp contacts with bot enable/disable toggles - Redesigned
 */

'use client';

import { useState, useEffect } from 'react';
import ContactList, { Contact } from '@/components/ContactList';
import { socketClient } from '@/lib/socket';
import Link from 'next/link';

export default function ContactsPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Calculate dynamic stats from contacts
  const totalContacts = contacts.length;
  const activeContacts = contacts.filter((c) => !c.isPaused).length;

  useEffect(() => {
    const socket = socketClient.getSocket();

    const handleConnectionStatus = (data: { status: 'connected' | 'disconnected' | 'qr' | 'ready' }) => {
      setIsConnected(data.status === 'ready' || data.status === 'connected');
    };

    socketClient.onConnectionStatus(handleConnectionStatus);
    setIsConnected(socket.connected);

    return () => {
      socketClient.offConnectionStatus(handleConnectionStatus);
    };
  }, []);

  // Load contacts (placeholder - will be implemented with real WhatsApp contact fetching)
  useEffect(() => {
    const loadPlaceholderContacts = () => {
      setTimeout(() => {
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
      }, 800);
    };

    loadPlaceholderContacts();
  }, []);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                Contacts
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Manage bot activation for your WhatsApp contacts
              </p>
            </div>

            {/* Stats summary */}
            <div className="flex gap-4">
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalContacts}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Contacts</p>
              </div>
              <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-2 dark:border-success-900/50 dark:bg-success-900/20">
                <p className="text-2xl font-bold text-success-600 dark:text-success-400">{activeContacts}</p>
                <p className="text-xs text-success-600 dark:text-success-400">Active</p>
              </div>
            </div>
          </div>
        </header>

        {/* Connection Warning */}
        {!isConnected && (
          <div className="mb-6 animate-fade-in rounded-lg border border-warning-200 bg-warning-50 p-4 dark:border-warning-900/50 dark:bg-warning-900/20">
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 flex-shrink-0 text-warning-500"
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
              <div className="flex-1">
                <p className="text-sm font-medium text-warning-700 dark:text-warning-300">
                  WhatsApp not connected
                </p>
                <p className="mt-1 text-xs text-warning-600 dark:text-warning-400">
                  Please authenticate first to manage your contacts and enable the bot.
                </p>
              </div>
              <Link
                href="/auth"
                className="btn btn-sm bg-warning-600 text-white hover:bg-warning-700"
              >
                Connect
              </Link>
            </div>
          </div>
        )}

        {/* Search and Filter Bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Search input */}
          <div className="relative flex-1 sm:max-w-xs">
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
              className="input pl-10"
            />
          </div>

          {/* Filter buttons */}
          <div className="flex gap-2">
            <button className="btn btn-sm btn-secondary">
              All
            </button>
            <button className="btn btn-sm btn-ghost">
              Active
            </button>
            <button className="btn btn-sm btn-ghost">
              Paused
            </button>
          </div>
        </div>

        {/* Contact List */}
        <ContactList contacts={contacts} setContacts={setContacts} isLoading={isLoading} />

        {/* Help Section */}
        <div className="mt-8 card animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                How it works
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    title: 'Enable bot',
                    description: 'Turn on automated responses for a contact',
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    ),
                  },
                  {
                    title: 'Disable bot',
                    description: 'Pause automated responses for that contact',
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    ),
                  },
                  {
                    title: 'Auto-pause',
                    description: 'Bot pauses 60min when you send manually',
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    ),
                  },
                  {
                    title: 'Rate limiting',
                    description: 'Auto-pause after 10 messages per minute',
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    ),
                  },
                  {
                    title: 'Master switch',
                    description: 'Pause all bot activity from the dashboard',
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                      />
                    ),
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-2">
                    <svg
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {item.icon}
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
