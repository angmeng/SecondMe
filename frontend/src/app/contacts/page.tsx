/**
 * Contacts List Page
 * Displays all WhatsApp contacts with bot enable/disable toggles
 */

'use client';

import { useState, useEffect } from 'react';
import ContactList from '@/components/ContactList';
import { socketClient } from '@/lib/socket';

export default function ContactsPage() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Check connection status
    const socket = socketClient.getSocket();

    socketClient.onConnectionStatus((data) => {
      setIsConnected(data.status === 'ready' || data.status === 'authenticated');
    });

    // Check if already connected
    setIsConnected(socket.connected);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Contacts</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Manage bot activation for your WhatsApp contacts
          </p>
        </div>

        {/* Connection Warning */}
        {!isConnected && (
          <div className="mb-6 rounded-lg border border-warning-light bg-warning-light/10 p-4">
            <div className="flex items-center">
              <svg
                className="h-5 w-5 text-warning"
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
              <p className="ml-3 text-sm font-medium text-warning-dark">
                WhatsApp not connected. Please{' '}
                <a href="/auth" className="underline">
                  authenticate
                </a>{' '}
                first.
              </p>
            </div>
          </div>
        )}

        {/* Contact List */}
        <ContactList />

        {/* Help Text */}
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            How it works:
          </h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>
              <strong>Enable bot</strong> for a contact to start automated responses
            </li>
            <li>
              <strong>Disable bot</strong> to pause automated responses for that contact
            </li>
            <li>Bot automatically pauses when you send a message manually (60 minutes)</li>
            <li>Rate limit protection: auto-pause after 10 messages per minute</li>
            <li>Use the master kill switch on the dashboard to pause all bot activity</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
