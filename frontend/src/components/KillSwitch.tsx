/**
 * Master Kill Switch Component
 * Global pause control for all bot activity with enhanced visuals
 */

'use client';

import { useState, useEffect } from 'react';
import { getErrorMessage } from '@/lib/errors';

export default function KillSwitch() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(getErrorMessage(err));
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
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className={`
        card overflow-hidden transition-all duration-300
        ${isEnabled ? 'border-error-200 dark:border-error-900/50' : 'border-success-200 dark:border-success-900/50'}
      `}
    >
      {/* Glow background effect */}
      <div
        className={`
          absolute inset-0 opacity-5 transition-opacity duration-500
          ${isEnabled ? 'bg-gradient-to-br from-error-500 to-error-600' : 'bg-gradient-to-br from-success-500 to-success-600'}
        `}
      />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side - Info */}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {/* Status Icon */}
            <div
              className={`
                flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300
                ${
                  isEnabled
                    ? 'bg-error-100 text-error-600 dark:bg-error-900/30 dark:text-error-400'
                    : 'bg-success-100 text-success-600 dark:bg-success-900/30 dark:text-success-400'
                }
              `}
            >
              {isEnabled ? (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
            </div>

            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Master Kill Switch
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {isEnabled
                  ? 'Bot is paused globally - no automated responses'
                  : 'Bot is active and responding to messages'}
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg bg-error-50 px-3 py-2 dark:bg-error-900/20">
              <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
            </div>
          )}
        </div>

        {/* Right side - Toggle */}
        <div className="flex items-center gap-4">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div
              className={`
                h-2.5 w-2.5 rounded-full transition-all duration-300
                ${
                  isEnabled
                    ? 'bg-error-500 shadow-glow-error animate-pulse-subtle'
                    : 'bg-success-500 shadow-glow-success'
                }
              `}
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {isEnabled ? 'Paused' : 'Active'}
            </span>
          </div>

          {/* Toggle Switch */}
          <button
            onClick={toggleKillSwitch}
            disabled={isLoading}
            className={`
              relative inline-flex h-14 w-28 flex-shrink-0 cursor-pointer items-center rounded-full
              transition-all duration-300 ease-bounce-in
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
              ${
                isEnabled
                  ? 'bg-error-500 shadow-glow-error focus-visible:ring-error-500'
                  : 'bg-success-500 shadow-glow-success focus-visible:ring-success-500'
              }
              ${isLoading ? 'opacity-70 cursor-wait' : 'hover:shadow-lg'}
            `}
            aria-label={isEnabled ? 'Resume bot activity' : 'Pause bot activity'}
            role="switch"
            aria-checked={isEnabled}
          >
            {/* Toggle knob */}
            <span
              className={`
                inline-flex h-12 w-12 transform items-center justify-center rounded-full
                bg-white shadow-lg transition-all duration-300 ease-bounce-in
                ${isEnabled ? 'translate-x-14' : 'translate-x-1'}
              `}
            >
              {isLoading ? (
                <svg
                  className="h-5 w-5 animate-spin text-slate-400"
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
              ) : isEnabled ? (
                <svg
                  className="h-6 w-6 text-error-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  className="h-6 w-6 text-success-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="relative mt-6 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 text-slate-400"
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
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {isEnabled
              ? 'Toggle to resume all bot activity'
              : 'Toggle to pause all bot activity instantly'}
          </span>
        </div>

        {/* Quick status badge */}
        <span
          className={`
            badge text-xs
            ${isEnabled ? 'badge-error' : 'badge-success'}
          `}
        >
          {isEnabled ? 'All Paused' : 'Operational'}
        </span>
      </div>
    </div>
  );
}
