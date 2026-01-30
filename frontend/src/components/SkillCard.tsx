/**
 * Skill Card Component
 * Displays a single skill with enable/disable toggle and settings
 */

'use client';

import type { SkillInfo, SkillHealthStatus } from '@secondme/shared-types';

interface SkillCardProps {
  skill: SkillInfo;
  onToggle: (skillId: string, enabled: boolean) => void;
  onConfigure: (skill: SkillInfo) => void;
  isLoading?: boolean;
}

function getHealthColor(health: SkillHealthStatus): string {
  switch (health) {
    case 'healthy':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-yellow-500';
    case 'unhealthy':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

function getHealthText(health: SkillHealthStatus): string {
  switch (health) {
    case 'healthy':
      return 'Healthy';
    case 'degraded':
      return 'Degraded';
    case 'unhealthy':
      return 'Unhealthy';
    default:
      return 'Unknown';
  }
}

export default function SkillCard({ skill, onToggle, onConfigure, isLoading }: SkillCardProps) {
  const { manifest, enabled, health } = skill;

  return (
    <div
      className={`rounded-lg border p-4 transition-all ${
        enabled
          ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
          : 'border-slate-200 bg-slate-50 opacity-75 dark:border-slate-700 dark:bg-slate-800/50'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Health indicator */}
          <div className="relative">
            <div className={`h-3 w-3 rounded-full ${getHealthColor(health)}`} />
            {enabled && health === 'healthy' && (
              <div className={`absolute inset-0 h-3 w-3 animate-ping rounded-full ${getHealthColor(health)} opacity-75`} />
            )}
          </div>

          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">{manifest.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              v{manifest.version} {manifest.author && `by ${manifest.author}`}
            </p>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => onToggle(manifest.id, !enabled)}
          disabled={isLoading}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
            enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
          } ${isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          aria-label={enabled ? 'Disable skill' : 'Enable skill'}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Description */}
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{manifest.description}</p>

      {/* Status & Actions */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              enabled
                ? health === 'healthy'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : health === 'degraded'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
            }`}
          >
            {enabled ? getHealthText(health) : 'Disabled'}
          </span>

          {/* Permissions */}
          {manifest.permissions.length > 0 && (
            <div className="flex gap-1">
              {manifest.permissions.map((perm) => (
                <span
                  key={perm}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                >
                  {perm.split(':')[0]}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Configure button */}
        {manifest.configFields.length > 0 && (
          <button
            onClick={() => onConfigure(skill)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Configure
          </button>
        )}
      </div>
    </div>
  );
}
