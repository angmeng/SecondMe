/**
 * Pairing Management Page
 * Admin interface for managing contact pairing requests and approvals
 */

'use client';

import { useState } from 'react';
import PairingRequests from '@/components/PairingRequests';
import ApprovedContacts from '@/components/ApprovedContacts';

type Tab = 'pending' | 'approved';

export default function PairingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Trigger refresh of approved contacts when a request is processed
  const handleRequestProcessed = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Contact Pairing</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Manage contact approval requests and control who can chat with your bot
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('pending')}
            className={`border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'pending'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Pending Requests
            </div>
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'approved'
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Approved Contacts
            </div>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'pending' ? (
        <div>
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="flex items-start gap-3">
              <svg
                className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className="font-medium text-blue-800 dark:text-blue-300">How Pairing Works</h3>
                <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
                  When unknown contacts message the bot, they receive a 6-digit verification code.
                  You can approve or deny their access here. Approved contacts can chat freely;
                  denied contacts enter a 24-hour cooldown.
                </p>
              </div>
            </div>
          </div>
          <PairingRequests onRequestProcessed={handleRequestProcessed} />
        </div>
      ) : (
        <ApprovedContacts refreshTrigger={refreshTrigger} />
      )}
    </div>
  );
}
