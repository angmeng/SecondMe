/**
 * Persona Editor Page
 * User Story 2: Allows user to view and edit communication personas
 */

'use client';

import { useState, useEffect } from 'react';
import PersonaEditor from '@/components/PersonaEditor';
import { SkeletonCard } from '@/components/ui/Skeleton';
import Link from 'next/link';

interface Persona {
  id: string;
  name: string;
  styleGuide: string;
  tone: string;
  exampleMessages: string[];
  applicableTo: string[];
}

export default function PersonaPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadPersonas();
  }, []);

  async function loadPersonas() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/persona');
      if (!response.ok) {
        throw new Error('Failed to load personas');
      }

      const data = await response.json();
      setPersonas(data.personas || []);

      // Select first persona by default
      if (data.personas && data.personas.length > 0) {
        setSelectedPersona(data.personas[0]);
      }
    } catch (err: any) {
      console.error('[PersonaPage] Error loading personas:', err);
      setError(err.message || 'Failed to load personas');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSavePersona(updates: Partial<Persona>) {
    if (!selectedPersona) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/persona/${selectedPersona.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save persona');
      }

      // Update local state
      const updatedPersona = { ...selectedPersona, ...updates };
      setSelectedPersona(updatedPersona);
      setPersonas((prev) =>
        prev.map((p) => (p.id === selectedPersona.id ? updatedPersona : p))
      );

      setSuccessMessage('Persona saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('[PersonaPage] Error saving persona:', err);
      setError(err.message || 'Failed to save persona');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                Communication Personas
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Define how the bot communicates on your behalf for different relationship types
              </p>
            </div>

            {/* Back to contacts */}
            <Link
              href="/contacts"
              className="btn btn-secondary flex items-center gap-2"
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
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Contacts
            </Link>
          </div>
        </header>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 animate-fade-in rounded-lg border border-success-200 bg-success-50 p-4 dark:border-success-900/50 dark:bg-success-900/20">
            <div className="flex items-center gap-3">
              <svg
                className="h-5 w-5 flex-shrink-0 text-success-500"
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
              <p className="text-sm text-success-700 dark:text-success-300">
                {successMessage}
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 animate-fade-in rounded-lg border border-error-200 bg-error-50 p-4 dark:border-error-900/50 dark:bg-error-900/20">
            <div className="flex items-center gap-3">
              <svg
                className="h-5 w-5 flex-shrink-0 text-error-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-error-700 dark:text-error-300">{error}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <SkeletonCard />
            </div>
            <div className="lg:col-span-2">
              <SkeletonCard />
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Persona List */}
            <div className="lg:col-span-1">
              <div className="card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                  Your Personas
                </h2>
                <div className="space-y-2">
                  {personas.map((persona) => (
                    <button
                      key={persona.id}
                      onClick={() => setSelectedPersona(persona)}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        selectedPersona?.id === persona.id
                          ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3
                            className={`font-medium ${
                              selectedPersona?.id === persona.id
                                ? 'text-primary-700 dark:text-primary-300'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {persona.name}
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {persona.applicableTo.join(', ')}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            persona.tone === 'formal'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : persona.tone === 'casual'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                          }`}
                        >
                          {persona.tone}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Add New Persona Button */}
                <button
                  className="mt-4 w-full rounded-lg border-2 border-dashed border-slate-300 p-3 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-300"
                  onClick={() => {
                    // TODO: Implement create persona modal
                    alert('Create new persona - coming soon!');
                  }}
                >
                  <span className="flex items-center justify-center gap-2">
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
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Add New Persona
                  </span>
                </button>
              </div>
            </div>

            {/* Persona Editor */}
            <div className="lg:col-span-2">
              {selectedPersona ? (
                <PersonaEditor
                  persona={selectedPersona}
                  onSave={handleSavePersona}
                  isSaving={isSaving}
                />
              ) : (
                <div className="card flex items-center justify-center py-12">
                  <p className="text-slate-500 dark:text-slate-400">
                    Select a persona to edit
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-8 card animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-start gap-4">
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
                About Personas
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Personas define how the bot communicates on your behalf. Each persona has a
                style guide that describes your writing patterns, tone, and example messages.
                The bot uses these to match your authentic voice for different types of
                relationships.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                    Style Guide
                  </h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Describes your writing patterns, emoji usage, and formality level
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                    Example Messages
                  </h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Real examples help the bot learn your authentic voice
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                    Applicable To
                  </h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Which contact types use this persona (friend, colleague, family)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
