/**
 * Contacts List Page
 * Displays all WhatsApp contacts with bot enable/disable toggles - Redesigned
 */

'use client';

import { useState, useEffect } from 'react';
import ContactList, { Contact } from '@/components/ContactList';
import { socketClient } from '@/lib/socket';
import Link from 'next/link';

interface SleepStatus {
  isSleeping: boolean;
  wakesUpAt?: number;
  minutesUntilWakeUp?: number;
}

export default function ContactsPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sleepStatus, setSleepStatus] = useState<SleepStatus>({ isSleeping: false });
  const [showHelp, setShowHelp] = useState(false);

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

    // Fetch sleep status
    fetchSleepStatus();

    return () => {
      socketClient.offConnectionStatus(handleConnectionStatus);
    };
  }, []);

  async function fetchSleepStatus() {
    try {
      const response = await fetch('/api/settings?section=sleep_hours');
      if (response.ok) {
        const data = await response.json();
        setSleepStatus(data.status);
      }
    } catch (err) {
      console.error('[ContactsPage] Error fetching sleep status:', err);
    }
  }

  function formatWakeUpTime(timestamp?: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Handle "How it works" help section visibility with localStorage
  useEffect(() => {
    const helpPreference = localStorage.getItem('contacts-help-shown');
    if (helpPreference === null) {
      // First-time visitor: expand and save preference
      setShowHelp(true);
      localStorage.setItem('contacts-help-shown', 'true');
    } else {
      // Returning visitor: respect saved collapsed/expanded state
      setShowHelp(helpPreference === 'true');
    }
  }, []);

  function toggleHelp() {
    setShowHelp((prev) => {
      const newValue = !prev;
      localStorage.setItem('contacts-help-shown', String(newValue));
      return newValue;
    });
  }

  // Fetch contacts from cache
  async function fetchContacts() {
    setIsLoading(true);
    try {
      const response = await fetch('/api/contacts');
      const data = await response.json();

      if (data.error) {
        console.error('[ContactsPage] API error:', data.error);
        setContacts([]);
        return;
      }

      const mapped: Contact[] = (data.contacts || []).map((c: any) => ({
        id: c.id,
        name: c.name || c.phoneNumber || 'Unknown',
        isPaused: c.isPaused || false,
        pauseReason: c.isPaused ? 'manual' : undefined,
        expiresAt: c.expiresAt,
      }));

      setContacts(mapped);
    } catch (err) {
      console.error('[ContactsPage] Error fetching contacts:', err);
      setContacts([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Refresh contacts from WhatsApp (re-fetch from source)
  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/contacts/refresh', { method: 'POST' });
      const data = await response.json();

      if (data.error) {
        console.error('[ContactsPage] Refresh error:', data.error);
      } else {
        console.log(`[ContactsPage] Refreshed ${data.count} contacts`);
      }

      // Re-fetch contacts from cache after refresh
      await fetchContacts();
    } catch (err) {
      console.error('[ContactsPage] Error refreshing contacts:', err);
    } finally {
      setIsRefreshing(false);
    }
  }

  // Initial fetch on mount
  useEffect(() => {
    fetchContacts();
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

            {/* Stats summary and refresh button */}
            <div className="flex items-center gap-4">
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalContacts}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Contacts</p>
              </div>
              <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-2 dark:border-success-900/50 dark:bg-success-900/20">
                <p className="text-2xl font-bold text-success-600 dark:text-success-400">{activeContacts}</p>
                <p className="text-xs text-success-600 dark:text-success-400">Active</p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || !isConnected}
                className="btn btn-sm flex items-center gap-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title={!isConnected ? 'Connect WhatsApp first' : 'Refresh contacts from WhatsApp'}
              >
                <svg
                  className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </header>

        {/* Sleep Status Banner - T102 */}
        {sleepStatus.isSleeping && (
          <div className="mb-6 animate-fade-in rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-900/50 dark:bg-purple-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <svg
                  className="h-5 w-5 text-purple-600 dark:text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                  Bot is sleeping
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  The bot won't respond to messages until {formatWakeUpTime(sleepStatus.wakesUpAt)}{' '}
                  ({sleepStatus.minutesUntilWakeUp} minutes)
                </p>
              </div>
              <Link
                href="/persona"
                className="btn btn-sm border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-800/50"
              >
                Configure
              </Link>
            </div>
          </div>
        )}

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

        {/* Contact List */}
        <ContactList contacts={contacts} setContacts={setContacts} isLoading={isLoading} />

        {/* Help Section - Collapsible */}
        <div className="mt-8 card animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <button
            onClick={toggleHelp}
            className="flex w-full items-center gap-4 text-left"
          >
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
            </div>
            <svg
              className={`h-5 w-5 flex-shrink-0 text-slate-400 transition-transform duration-200 ${
                showHelp ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <div
            className={`grid overflow-hidden transition-all duration-300 ease-in-out ${
              showHelp ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="overflow-hidden">
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
