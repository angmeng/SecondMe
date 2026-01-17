/**
 * Sleep Hours Configuration Component
 * T099: Allows users to configure when the bot should "sleep" (not respond)
 */

'use client';

import { useState, useEffect } from 'react';

interface SleepHoursConfig {
  enabled: boolean;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  timezoneOffset: number;
}

interface SleepStatus {
  isSleeping: boolean;
  wakesUpAt?: number;
  minutesUntilWakeUp?: number;
}

interface Props {
  className?: string;
}

export default function SleepHoursConfig({ className = '' }: Props) {
  const [config, setConfig] = useState<SleepHoursConfig>({
    enabled: true,
    startHour: 23,
    startMinute: 0,
    endHour: 7,
    endMinute: 0,
    timezoneOffset: 0,
  });
  const [status, setStatus] = useState<SleepStatus>({ isSleeping: false });
  const [deferredCount, setDeferredCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const response = await fetch('/api/settings?section=sleep_hours');
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        setStatus(data.status);
        setDeferredCount(data.deferredCount || 0);
      }
    } catch (err: any) {
      console.error('[SleepHoursConfig] Error loading settings:', err);
      setError('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'sleep_hours', config }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      const data = await response.json();
      setConfig(data.config);
      setStatus(data.status);
      setSuccess('Sleep hours settings saved');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  function formatTime(hour: number, minute: number): string {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  function formatWakeUpTime(timestamp?: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Generate timezone options
  const timezoneOptions = [];
  for (let offset = -12; offset <= 14; offset++) {
    const sign = offset >= 0 ? '+' : '';
    timezoneOptions.push({
      value: offset,
      label: `UTC${sign}${offset}`,
    });
  }

  if (isLoading) {
    return (
      <div className={`card animate-pulse ${className}`}>
        <div className="h-6 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="mt-4 space-y-3">
          <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-10 w-full rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-10 w-full rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    );
  }

  return (
    <div className={`card ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Sleep Hours
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure when the bot should not respond (simulating sleep)
          </p>
        </div>

        {/* Status indicator */}
        {config.enabled && (
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
              status.isSleeping
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            }`}
          >
            <div
              className={`h-2 w-2 rounded-full ${
                status.isSleeping ? 'bg-purple-500 animate-pulse' : 'bg-green-500'
              }`}
            />
            {status.isSleeping ? 'Sleeping' : 'Awake'}
          </div>
        )}
      </div>

      {/* Success Message */}
      {success && (
        <div className="mb-4 rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700 dark:border-success-900/50 dark:bg-success-900/20 dark:text-success-300">
          {success}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-300">
          {error}
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="mb-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="h-5 w-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Enable sleep hours
          </span>
        </label>
        <p className="mt-1 ml-8 text-xs text-slate-500 dark:text-slate-400">
          When enabled, the bot won't respond during configured sleep hours
        </p>
      </div>

      {/* Time Configuration */}
      <div className={`space-y-4 ${!config.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Sleep Start Time */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Sleep Start
            </label>
            <div className="flex gap-2">
              <select
                value={config.startHour}
                onChange={(e) =>
                  setConfig({ ...config, startHour: parseInt(e.target.value) })
                }
                className="input flex-1"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
              <span className="flex items-center text-slate-500">:</span>
              <select
                value={config.startMinute}
                onChange={(e) =>
                  setConfig({ ...config, startMinute: parseInt(e.target.value) })
                }
                className="input flex-1"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {m.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Wake Up Time */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Wake Up
            </label>
            <div className="flex gap-2">
              <select
                value={config.endHour}
                onChange={(e) => setConfig({ ...config, endHour: parseInt(e.target.value) })}
                className="input flex-1"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
              <span className="flex items-center text-slate-500">:</span>
              <select
                value={config.endMinute}
                onChange={(e) =>
                  setConfig({ ...config, endMinute: parseInt(e.target.value) })
                }
                className="input flex-1"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {m.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Timezone
          </label>
          <select
            value={config.timezoneOffset}
            onChange={(e) =>
              setConfig({ ...config, timezoneOffset: parseInt(e.target.value) })
            }
            className="input"
          >
            {timezoneOptions.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Sleep hours: {formatTime(config.startHour, config.startMinute)} -{' '}
            {formatTime(config.endHour, config.endMinute)}
          </p>
        </div>

        {/* Sleep Status Info */}
        {status.isSleeping && (
          <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
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
              <div>
                <p className="font-medium text-purple-700 dark:text-purple-300">Currently Sleeping</p>
                <p className="text-sm text-purple-600 dark:text-purple-400">
                  Wakes up at {formatWakeUpTime(status.wakesUpAt)}
                  {status.minutesUntilWakeUp && ` (${status.minutesUntilWakeUp} minutes)`}
                </p>
                {deferredCount > 0 && (
                  <p className="text-xs text-purple-500 mt-1">
                    {deferredCount} message(s) queued for processing
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn btn-primary"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </button>
      </div>
    </div>
  );
}
