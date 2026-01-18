/**
 * Create Persona Modal Component
 * User Story 2: Modal form for creating new communication personas
 */

'use client';

import { useState, useEffect, useRef } from 'react';

interface Persona {
  id: string;
  name: string;
  styleGuide: string;
  tone: string;
  exampleMessages: string[];
  applicableTo: string[];
}

interface CreatePersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (persona: Persona) => void;
}

interface ParsedMessage {
  timestamp: string;
  sender: string;
  content: string;
  isMedia: boolean;
}

const TONE_OPTIONS = ['formal', 'casual', 'friendly', 'professional', 'playful'];

const RELATIONSHIP_OPTIONS = ['colleague', 'client', 'manager', 'friend', 'acquaintance', 'family', 'romantic_partner'];

export default function CreatePersonaModal({
  isOpen,
  onClose,
  onCreated,
}: CreatePersonaModalProps) {
  const [name, setName] = useState('');
  const [styleGuide, setStyleGuide] = useState('');
  const [tone, setTone] = useState('friendly');
  const [exampleMessages, setExampleMessages] = useState<string[]>([]);
  const [applicableTo, setApplicableTo] = useState<string[]>([]);
  const [newExample, setNewExample] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // WhatsApp import state
  const [importMode, setImportMode] = useState<'manual' | 'import'>('manual');
  const [parsedMessages, setParsedMessages] = useState<ParsedMessage[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    // Focus the name input when modal opens
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 100);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setStyleGuide('');
      setTone('friendly');
      setExampleMessages([]);
      setApplicableTo([]);
      setNewExample('');
      setError(null);
      setValidationErrors({});
      // Reset import state
      setImportMode('manual');
      setParsedMessages([]);
      setParticipants([]);
      setSelectedParticipant(null);
      setSelectedMessages(new Set());
      setIsParsing(false);
      setParseError(null);
    }
  }, [isOpen]);

  function handleAddExample() {
    if (newExample.trim()) {
      setExampleMessages([...exampleMessages, newExample.trim()]);
      setNewExample('');
      // Clear validation error if we now have enough examples
      if (exampleMessages.length >= 2) {
        setValidationErrors((prev) => {
          const { exampleMessages: _, ...rest } = prev;
          return rest;
        });
      }
    }
  }

  function handleRemoveExample(index: number) {
    setExampleMessages(exampleMessages.filter((_, i) => i !== index));
  }

  // WhatsApp import handlers
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setParseError(null);
    setSelectedParticipant(null);
    setSelectedMessages(new Set());
    setParsedMessages([]);
    setParticipants([]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse-chat', {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as {
        error?: string;
        messages?: ParsedMessage[];
        participants?: string[];
      };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse file');
      }

      if (!data.messages || data.messages.length === 0) {
        throw new Error('No messages found in file. Make sure this is a WhatsApp chat export.');
      }

      setParsedMessages(data.messages);
      setParticipants(data.participants || []);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Parse failed');
    } finally {
      setIsParsing(false);
      // Reset file input so the same file can be re-uploaded
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleParticipantSelect(participant: string) {
    setSelectedParticipant(participant);
    setSelectedMessages(new Set());
  }

  function toggleMessageSelection(idx: number) {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  function selectAllMessages() {
    const userMessages = parsedMessages.filter((m) => m.sender === selectedParticipant);
    setSelectedMessages(new Set(userMessages.map((_, idx) => idx)));
  }

  function deselectAllMessages() {
    setSelectedMessages(new Set());
  }

  function addSelectedAsExamples() {
    const userMessages = parsedMessages.filter((m) => m.sender === selectedParticipant);
    const newExamples = Array.from(selectedMessages)
      .sort((a, b) => a - b)
      .map((idx) => userMessages[idx]?.content)
      .filter(Boolean) as string[];

    // Add to existing examples, limiting to 20 total
    setExampleMessages((prev) => [...prev, ...newExamples].slice(0, 20));

    // Reset import state
    setSelectedMessages(new Set());
    setParsedMessages([]);
    setParticipants([]);
    setSelectedParticipant(null);
    setImportMode('manual');

    // Clear validation error if we now have enough examples
    if (exampleMessages.length + newExamples.length >= 3) {
      setValidationErrors((prev) => {
        const { exampleMessages: _, ...rest } = prev;
        return rest;
      });
    }
  }

  function handleToggleRelationship(relationship: string) {
    if (applicableTo.includes(relationship)) {
      setApplicableTo(applicableTo.filter((r) => r !== relationship));
    } else {
      setApplicableTo([...applicableTo, relationship]);
    }
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Name is required';
    }

    if (styleGuide.length < 100) {
      errors.styleGuide = `Style guide must be at least 100 characters (${styleGuide.length}/100)`;
    } else if (styleGuide.length > 10000) {
      errors.styleGuide = `Style guide must be at most 10,000 characters (${styleGuide.length}/10000)`;
    }

    if (exampleMessages.length < 3) {
      errors.exampleMessages = `At least 3 example messages required (${exampleMessages.length}/3)`;
    } else if (exampleMessages.length > 20) {
      errors.exampleMessages = `Maximum 20 example messages allowed (${exampleMessages.length}/20)`;
    }

    if (applicableTo.length === 0) {
      errors.applicableTo = 'Select at least one relationship type';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/persona', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          styleGuide,
          tone,
          exampleMessages,
          applicableTo,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create persona');
      }

      const data = await response.json();

      // Create the full persona object for the callback
      const newPersona: Persona = {
        id: data.id,
        name: name.trim(),
        styleGuide,
        tone,
        exampleMessages,
        applicableTo,
      };

      onCreated(newPersona);
    } catch (err: unknown) {
      console.error('[CreatePersonaModal] Error creating persona:', err);
      setError(err instanceof Error ? err.message : 'Failed to create persona');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-persona-title"
    >
      <div
        ref={modalRef}
        className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in"
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
          <div>
            <h2
              id="create-persona-title"
              className="text-lg font-semibold text-slate-900 dark:text-white"
            >
              Create New Persona
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Define a new communication style for your contacts
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close modal"
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

        {/* Error Banner */}
        {error && (
          <div className="mb-6 rounded-lg border border-error-200 bg-error-50 p-4 dark:border-error-900/50 dark:bg-error-900/20">
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label
              htmlFor="persona-name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Persona Name <span className="text-error-500">*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              id="persona-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`input mt-1 ${validationErrors.name ? 'border-error-500 focus:border-error-500 focus:ring-error-500' : ''}`}
              placeholder="e.g., Professional Colleague"
            />
            {validationErrors.name && (
              <p className="mt-1 text-sm text-error-500">{validationErrors.name}</p>
            )}
          </div>

          {/* Tone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Tone <span className="text-error-500">*</span>
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
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
              Use for Relationship Types <span className="text-error-500">*</span>
            </label>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Select which contact types should use this persona
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {RELATIONSHIP_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
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
            {validationErrors.applicableTo && (
              <p className="mt-1 text-sm text-error-500">{validationErrors.applicableTo}</p>
            )}
          </div>

          {/* Style Guide */}
          <div>
            <label
              htmlFor="persona-styleguide"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Style Guide <span className="text-error-500">*</span>
            </label>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Describe your writing patterns, formality level, emoji usage, and typical phrases
              (100-10,000 characters)
            </p>
            <textarea
              id="persona-styleguide"
              value={styleGuide}
              onChange={(e) => setStyleGuide(e.target.value)}
              rows={5}
              className={`input mt-2 resize-none ${validationErrors.styleGuide ? 'border-error-500 focus:border-error-500 focus:ring-error-500' : ''}`}
              placeholder="e.g., Use formal language. Address people by title. Keep messages concise. Avoid emojis. Start emails with 'Dear' and end with 'Best regards'."
            />
            <div className="mt-1 flex justify-between text-xs">
              {validationErrors.styleGuide ? (
                <p className="text-error-500">{validationErrors.styleGuide}</p>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">
                  {styleGuide.length < 100
                    ? `${100 - styleGuide.length} more characters needed`
                    : 'Good length'}
                </span>
              )}
              <span
                className={`${
                  styleGuide.length < 100 || styleGuide.length > 10000
                    ? 'text-error-500'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {styleGuide.length}/10,000
              </span>
            </div>
          </div>

          {/* Example Messages */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Example Messages <span className="text-error-500">*</span>
            </label>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Add real examples of how you typically write in this persona (3-20 examples)
            </p>

            {/* Mode Tabs */}
            <div className="mt-3 flex rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setImportMode('manual')}
                className={`flex-1 rounded-l-lg px-4 py-2 text-sm font-medium transition-colors ${
                  importMode === 'manual'
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                Type Manually
              </button>
              <button
                type="button"
                onClick={() => setImportMode('import')}
                className={`flex-1 rounded-r-lg px-4 py-2 text-sm font-medium transition-colors ${
                  importMode === 'import'
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                Import from WhatsApp
              </button>
            </div>

            {/* Existing Examples (always shown) */}
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
                      type="button"
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

            {/* Manual Mode - Add New Example */}
            {importMode === 'manual' && (
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
                  disabled={exampleMessages.length >= 20}
                />
                <button
                  type="button"
                  onClick={handleAddExample}
                  disabled={!newExample.trim() || exampleMessages.length >= 20}
                  className="btn btn-secondary disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}

            {/* Import Mode - WhatsApp Import Flow */}
            {importMode === 'import' && (
              <div className="mt-3 space-y-4">
                {/* Step 1: File Upload */}
                {parsedMessages.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center dark:border-slate-600">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="whatsapp-file-input"
                    />
                    <label htmlFor="whatsapp-file-input" className="cursor-pointer">
                      <svg
                        className="mx-auto h-12 w-12 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                        {isParsing ? 'Parsing file...' : 'Click to upload WhatsApp export'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        WhatsApp → Chat → More → Export chat → Without media
                      </p>
                    </label>
                    {parseError && <p className="mt-3 text-sm text-error-500">{parseError}</p>}
                  </div>
                )}

                {/* Step 2: Participant Selector */}
                {parsedMessages.length > 0 && !selectedParticipant && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Who are YOU in this chat?
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Select yourself to import your messages as examples
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {participants.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleParticipantSelect(p)}
                          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-primary-50 hover:text-primary-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setParsedMessages([]);
                        setParticipants([]);
                      }}
                      className="mt-3 text-xs text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300"
                    >
                      Upload different file
                    </button>
                  </div>
                )}

                {/* Step 3: Message Selection */}
                {selectedParticipant && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Messages from {selectedParticipant}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {parsedMessages.filter((m) => m.sender === selectedParticipant).length}{' '}
                            messages found
                            {selectedMessages.size > 0 && ` • ${selectedMessages.size} selected`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={selectAllMessages}
                            className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                          >
                            Select all
                          </button>
                          <span className="text-slate-300 dark:text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={deselectAllMessages}
                            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {parsedMessages
                        .filter((m) => m.sender === selectedParticipant)
                        .map((msg, idx) => (
                          <label
                            key={idx}
                            className="flex cursor-pointer items-start gap-3 border-b border-slate-100 p-3 transition-colors hover:bg-slate-50 last:border-b-0 dark:border-slate-800 dark:hover:bg-slate-800/50"
                          >
                            <input
                              type="checkbox"
                              checked={selectedMessages.has(idx)}
                              onChange={() => toggleMessageSelection(idx)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 dark:text-slate-300 break-words">
                                {msg.content}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {new Date(msg.timestamp).toLocaleDateString()}
                              </p>
                            </div>
                          </label>
                        ))}
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => setSelectedParticipant(null)}
                        className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      >
                        Change participant
                      </button>
                      <button
                        type="button"
                        onClick={addSelectedAsExamples}
                        disabled={selectedMessages.size === 0}
                        className="btn btn-primary text-sm disabled:opacity-50"
                      >
                        Add {selectedMessages.size} Selected
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-1 flex justify-between text-xs">
              {validationErrors.exampleMessages ? (
                <p className="text-error-500">{validationErrors.exampleMessages}</p>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">
                  {exampleMessages.length < 3
                    ? `${3 - exampleMessages.length} more example${3 - exampleMessages.length !== 1 ? 's' : ''} needed`
                    : 'Good number of examples'}
                </span>
              )}
              <span className="text-slate-500 dark:text-slate-400">
                {exampleMessages.length}/20
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-6 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary disabled:opacity-50"
            >
              {isSubmitting ? (
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
                  Creating...
                </span>
              ) : (
                'Create Persona'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
