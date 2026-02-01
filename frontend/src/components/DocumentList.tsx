/**
 * Document List Component
 * Displays uploaded documents with status badges and actions
 */

'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import type { UploadedDocument, DocumentStatus, DocumentCategory } from '@secondme/shared-types';

interface DocumentListProps {
  documents: UploadedDocument[];
  onDelete: (documentId: string) => Promise<void>;
}

const statusConfig: Record<DocumentStatus, { label: string; color: string; icon: ReactNode }> = {
  pending: {
    label: 'Pending',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  processing: {
    label: 'Processing',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    icon: (
      <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    ),
  },
  completed: {
    label: 'Completed',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  failed: {
    label: 'Failed',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
};

const categoryLabels: Record<DocumentCategory, string> = {
  professional: 'Professional',
  personal: 'Personal',
  knowledge: 'Knowledge Base',
  notes: 'Notes',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFileIcon(mimeType: string): ReactNode {
  if (mimeType === 'application/pdf') {
    return (
      <svg className="h-8 w-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-2.5 8.5v3h1c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1h-1zm-3 0v4h1v-1.5h.5c.83 0 1.5-.67 1.5-1.5s-.67-1-1.5-1h-1.5zm6 0v4h1v-1h.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5h-2zM8 13.5v1h.5c.28 0 .5-.22.5-.5s-.22-.5-.5-.5H8zm4 0v1h.5c.28 0 .5-.22.5-.5s-.22-.5-.5-.5H12zm4 0v2h.5c.55 0 1-.45 1-1s-.45-1-1-1H16z" />
      </svg>
    );
  }
  if (mimeType.includes('word') || mimeType.includes('document')) {
    return (
      <svg className="h-8 w-8 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM8.5 13h2l.5 2 .5-2h2l-1.5 5h-1.5L10 15.5 9.5 18H8l-1.5-5z" />
      </svg>
    );
  }
  // Default text/markdown/html
  return (
    <svg className="h-8 w-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export default function DocumentList({ documents, onDelete }: DocumentListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (documentId: string) => {
    setDeletingId(documentId);
    try {
      await onDelete(documentId);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-3">
      {documents.map((doc) => {
        const status = statusConfig[doc.status];
        const isDeleting = deletingId === doc.id;
        const isConfirming = confirmDeleteId === doc.id;

        return (
          <div
            key={doc.id}
            className="rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="flex items-start gap-4">
              {/* File Icon */}
              <div className="flex-shrink-0">
                {getFileIcon(doc.mimeType)}
              </div>

              {/* Document Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/knowledge/${doc.id}`}
                      className="block truncate text-sm font-medium text-slate-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                    >
                      {doc.originalName}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatFileSize(doc.sizeBytes)}</span>
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <span>{categoryLabels[doc.category]}</span>
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <span>{formatDate(doc.uploadedAt)}</span>
                      {doc.chunkCount !== undefined && doc.status === 'completed' && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">|</span>
                          <span>{doc.chunkCount} chunks</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                    {status.icon}
                    <span>{status.label}</span>
                  </div>
                </div>

                {/* Error Message */}
                {doc.status === 'failed' && doc.error && (
                  <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                    {doc.error}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    href={`/knowledge/${doc.id}`}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  >
                    View Details
                  </Link>
                  <span className="text-slate-300 dark:text-slate-600">|</span>

                  {isConfirming ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 dark:text-red-400">Delete?</span>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={isDeleting}
                        className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        {isDeleting ? 'Deleting...' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(doc.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
