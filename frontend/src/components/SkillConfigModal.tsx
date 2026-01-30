/**
 * Skill Configuration Modal
 * Dynamic form for editing skill settings
 */

'use client';

import { useState, useEffect } from 'react';
import type { SkillInfo, SkillConfigField } from '@secondme/shared-types';

interface SkillConfigModalProps {
  skill: SkillInfo;
  isOpen: boolean;
  onClose: () => void;
  onSave: (skillId: string, config: Record<string, unknown>) => Promise<void>;
}

export default function SkillConfigModal({ skill, isOpen, onClose, onSave }: SkillConfigModalProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Initialize config from skill
  useEffect(() => {
    if (isOpen) {
      const initialConfig: Record<string, unknown> = {};
      for (const field of skill.manifest.configFields) {
        initialConfig[field.key] = skill.config[field.key] ?? field.default;
      }
      setConfig(initialConfig);
    }
  }, [isOpen, skill]);

  const handleChange = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(skill.manifest.id, config);
      onClose();
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    const defaultConfig: Record<string, unknown> = {};
    for (const field of skill.manifest.configFields) {
      defaultConfig[field.key] = field.default;
    }
    setConfig(defaultConfig);
  };

  const renderField = (field: SkillConfigField) => {
    const value = config[field.key] ?? field.default;

    switch (field.type) {
      case 'boolean':
        return (
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={value as boolean}
              onChange={(e) => handleChange(field.key, e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">{field.label}</span>
          </label>
        );

      case 'number':
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label}
            </label>
            <input
              type="number"
              value={value as number}
              onChange={(e) => handleChange(field.key, parseInt(e.target.value, 10) || 0)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
        );

      case 'select':
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label}
            </label>
            <select
              value={value as string}
              onChange={(e) => handleChange(field.key, e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </div>
        );

      case 'string':
      default:
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label}
            </label>
            <input
              type="text"
              value={value as string}
              onChange={(e) => handleChange(field.key, e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Configure {skill.manifest.name}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {skill.manifest.configFields.map((field) => (
            <div key={field.key}>
              {renderField(field)}
              {field.description && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{field.description}</p>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
          >
            Reset to defaults
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
