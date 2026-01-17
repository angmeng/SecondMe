/**
 * PersonaSelector Component
 * Dropdown for selecting a persona to assign to a contact
 */

'use client';

import { useState, useEffect, useRef } from 'react';

interface Persona {
  id: string;
  name: string;
  tone: string;
  styleGuide: string;
  applicableTo: string[];
}

interface PersonaSelectorProps {
  contactId: string;
  currentPersonaId?: string;
  currentPersonaName?: string;
  onPersonaChange?: (personaId: string | null, personaName: string | null) => void;
}

export default function PersonaSelector({
  contactId,
  currentPersonaId,
  currentPersonaName,
  onPersonaChange,
}: PersonaSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch personas when dropdown opens
  useEffect(() => {
    if (isOpen && personas.length === 0) {
      fetchPersonas();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchPersonas() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/persona');
      if (!response.ok) {
        throw new Error('Failed to fetch personas');
      }

      const data = await response.json();
      setPersonas(data.personas || []);
    } catch (err: unknown) {
      console.error('[PersonaSelector] Error fetching personas:', err);
      setError('Failed to load personas');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectPersona(personaId: string | null, personaName: string | null) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedPersona: personaId }),
      });

      if (!response.ok) {
        throw new Error('Failed to update persona');
      }

      // Notify parent component
      onPersonaChange?.(personaId, personaName);
      setIsOpen(false);
    } catch (err: unknown) {
      console.error('[PersonaSelector] Error saving persona:', err);
      setError('Failed to save');
    } finally {
      setIsSaving(false);
    }
  }

  // Get tone badge color
  function getToneBadgeColor(tone: string): string {
    const defaultColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    const toneColors: Record<string, string> = {
      casual: defaultColor,
      professional:
        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      friendly:
        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      formal: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
    };
    return toneColors[tone.toLowerCase()] ?? defaultColor;
  }

  const displayName = currentPersonaName || 'Auto';
  const isAuto = !currentPersonaId;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSaving}
        className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <svg
          className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        <span>{isSaving ? 'Saving...' : displayName}</span>
        <svg
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {isLoading ? (
            <div className="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading personas...
            </div>
          ) : error ? (
            <div className="px-3 py-4 text-center text-sm text-red-500">{error}</div>
          ) : (
            <>
              {/* Auto Option */}
              <button
                onClick={() => handleSelectPersona(null, null)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                  isAuto ? 'bg-slate-50 dark:bg-slate-700' : ''
                }`}
              >
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-200">Auto</span>
                    <span className="ml-1 text-slate-500 dark:text-slate-400">
                      (based on relationship)
                    </span>
                  </div>
                </div>
                {isAuto && (
                  <svg
                    className="h-4 w-4 text-primary-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>

              {/* Divider */}
              <div className="my-1 border-t border-slate-200 dark:border-slate-700" />

              {/* Personas List */}
              {personas.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                  No personas available
                </div>
              ) : (
                personas.map((persona) => (
                  <button
                    key={persona.id}
                    onClick={() => handleSelectPersona(persona.id, persona.name)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                      currentPersonaId === persona.id ? 'bg-slate-50 dark:bg-slate-700' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {persona.name}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getToneBadgeColor(persona.tone)}`}
                      >
                        {persona.tone}
                      </span>
                    </div>
                    {currentPersonaId === persona.id && (
                      <svg
                        className="h-4 w-4 text-primary-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
