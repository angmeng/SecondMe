/**
 * Persona Editor Component
 * User Story 2: Editable form for persona style guide and settings
 */

'use client';

import { useState, useEffect } from 'react';

interface Persona {
  id: string;
  name: string;
  styleGuide: string;
  tone: string;
  exampleMessages: string[];
  applicableTo: string[];
}

interface PersonaEditorProps {
  persona: Persona;
  onSave: (updates: Partial<Persona>) => Promise<void>;
  isSaving: boolean;
}

const TONE_OPTIONS = ['formal', 'casual', 'friendly', 'professional', 'playful'];

const RELATIONSHIP_OPTIONS = [
  'colleague',
  'client',
  'manager',
  'friend',
  'acquaintance',
  'family',
];

export default function PersonaEditor({
  persona,
  onSave,
  isSaving,
}: PersonaEditorProps) {
  const [name, setName] = useState(persona.name);
  const [styleGuide, setStyleGuide] = useState(persona.styleGuide);
  const [tone, setTone] = useState(persona.tone);
  const [exampleMessages, setExampleMessages] = useState(persona.exampleMessages);
  const [applicableTo, setApplicableTo] = useState(persona.applicableTo);
  const [newExample, setNewExample] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Reset form when persona changes
  useEffect(() => {
    setName(persona.name);
    setStyleGuide(persona.styleGuide);
    setTone(persona.tone);
    setExampleMessages(persona.exampleMessages);
    setApplicableTo(persona.applicableTo);
    setHasChanges(false);
  }, [persona]);

  // Track changes
  useEffect(() => {
    const changed =
      name !== persona.name ||
      styleGuide !== persona.styleGuide ||
      tone !== persona.tone ||
      JSON.stringify(exampleMessages) !== JSON.stringify(persona.exampleMessages) ||
      JSON.stringify(applicableTo) !== JSON.stringify(persona.applicableTo);

    setHasChanges(changed);
  }, [name, styleGuide, tone, exampleMessages, applicableTo, persona]);

  function handleAddExample() {
    if (newExample.trim()) {
      setExampleMessages([...exampleMessages, newExample.trim()]);
      setNewExample('');
    }
  }

  function handleRemoveExample(index: number) {
    setExampleMessages(exampleMessages.filter((_, i) => i !== index));
  }

  function handleToggleRelationship(relationship: string) {
    if (applicableTo.includes(relationship)) {
      setApplicableTo(applicableTo.filter((r) => r !== relationship));
    } else {
      setApplicableTo([...applicableTo, relationship]);
    }
  }

  async function handleSave() {
    await onSave({
      name,
      styleGuide,
      tone,
      exampleMessages,
      applicableTo,
    });
  }

  function handleReset() {
    setName(persona.name);
    setStyleGuide(persona.styleGuide);
    setTone(persona.tone);
    setExampleMessages(persona.exampleMessages);
    setApplicableTo(persona.applicableTo);
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Edit Persona
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Customize how the bot communicates using this persona
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={!hasChanges || isSaving}
            className="btn btn-ghost btn-sm disabled:opacity-50"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                Saving...
              </span>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-6">
        {/* Name */}
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Persona Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input mt-1"
            placeholder="e.g., Professional Colleague"
          />
        </div>

        {/* Tone */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Tone
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  tone === t
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Applicable To */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Use for Relationship Types
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Select which contact types should use this persona
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {RELATIONSHIP_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => handleToggleRelationship(r)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  applicableTo.includes(r)
                    ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {applicableTo.includes(r) && (
                  <svg
                    className="h-3.5 w-3.5"
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
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Style Guide */}
        <div>
          <label
            htmlFor="styleGuide"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Style Guide
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Describe your writing patterns, formality level, emoji usage, and typical phrases
          </p>
          <textarea
            id="styleGuide"
            value={styleGuide}
            onChange={(e) => setStyleGuide(e.target.value)}
            rows={5}
            className="input mt-2 resize-none"
            placeholder="e.g., Use formal language. Address people by title. Keep messages concise. Avoid emojis."
          />
        </div>

        {/* Example Messages */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Example Messages
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Add real examples of how you typically write in this persona
          </p>

          {/* Existing Examples */}
          {exampleMessages.length > 0 && (
            <div className="mt-3 space-y-2">
              {exampleMessages.map((example, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex-1">
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      &ldquo;{example}&rdquo;
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveExample(index)}
                    className="flex-shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-error-500 dark:hover:bg-slate-700"
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add New Example */}
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newExample}
              onChange={(e) => setNewExample(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddExample();
                }
              }}
              className="input flex-1"
              placeholder="Type an example message..."
            />
            <button
              onClick={handleAddExample}
              disabled={!newExample.trim()}
              className="btn btn-secondary disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Unsaved Changes Indicator */}
      {hasChanges && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-4 py-2 dark:border-warning-900/50 dark:bg-warning-900/20">
          <svg
            className="h-4 w-4 text-warning-500"
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
          <span className="text-sm text-warning-700 dark:text-warning-300">
            You have unsaved changes
          </span>
        </div>
      )}
    </div>
  );
}
