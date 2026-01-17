/**
 * Offline Page
 * T122: Page shown when the app is offline
 */

'use client';

import { useEffect, useState } from 'react';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Redirect to home if online
  useEffect(() => {
    if (isOnline) {
      window.location.href = '/';
    }
  }, [isOnline]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <div className="text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-warning-100 dark:bg-warning-900/30">
          <svg
            className="h-12 w-12 text-warning-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
          You&apos;re offline
        </h1>

        {/* Description */}
        <p className="mb-6 max-w-md text-slate-500 dark:text-slate-400">
          SecondMe requires an internet connection to function.
          Please check your connection and try again.
        </p>

        {/* Connection status indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className={`h-3 w-3 rounded-full ${isOnline ? 'bg-success-500' : 'bg-error-500'}`} />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {isOnline ? 'Connected' : 'No connection'}
          </span>
        </div>

        {/* Retry button */}
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          <svg
            className="h-4 w-4"
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
          Try Again
        </button>

        {/* Help text */}
        <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
          If the problem persists, check your router or contact your network administrator.
        </p>
      </div>
    </div>
  );
}
