/**
 * Master Kill Switch Component
 * Global pause control for all bot activity
 */

'use client';

import { useState, useEffect } from 'react';

export default function KillSwitch() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check initial state on mount
  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const response = await fetch('/api/kill-switch');
      const data = await response.json();

      if (response.ok) {
        setIsEnabled(data.enabled);
      } else {
        setError(data.error || 'Failed to check status');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleKillSwitch() {
    setIsLoading(true);
    setError(null);

    try {
      const method = isEnabled ? 'DELETE' : 'POST';
      const response = await fetch('/api/kill-switch', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: method === 'POST' ? JSON.stringify({ duration: 0 }) : undefined,
      });

      const data = await response.json();

      if (response.ok) {
        setIsEnabled(data.enabled);
      } else {
        setError(data.error || 'Failed to toggle kill switch');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Master Kill Switch
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {isEnabled
              ? 'Bot is paused globally - no automated responses'
              : 'Bot is active and responding to messages'}
          </p>
          {error && <p className="mt-1 text-sm text-error">{error}</p>}
        </div>

        <div className="ml-4">
          <button
            onClick={toggleKillSwitch}
            disabled={isLoading}
            className={`relative inline-flex h-12 w-24 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isEnabled
                ? 'bg-error focus:ring-error'
                : 'bg-success focus:ring-success'
            } ${isLoading ? 'opacity-50' : ''}`}
            aria-label={isEnabled ? 'Disable kill switch' : 'Enable kill switch'}
          >
            {/* Toggle circle */}
            <span
              className={`inline-block h-10 w-10 transform rounded-full bg-white shadow-lg transition-transform ${
                isEnabled ? 'translate-x-12' : 'translate-x-1'
              }`}
            >
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  {isEnabled ? (
                    <svg
                      className="h-6 w-6 text-error"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-6 w-6 text-success"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Status indicator */}
      <div className="mt-4 flex items-center space-x-2">
        <div
          className={`h-3 w-3 rounded-full ${
            isEnabled ? 'bg-error animate-pulse' : 'bg-success'
          }`}
        ></div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {isEnabled ? 'All bot activity paused' : 'Bot is operational'}
        </span>
      </div>
    </div>
  );
}
