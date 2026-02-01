/**
 * Document Detail Page
 * View document metadata, status, and extracted information
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { UploadedDocument, DocumentCategory, DocumentStatus } from '@secondme/shared-types';
import { useToast } from '@/contexts/ToastContext';

const categoryLabels: Record<DocumentCategory, string> = {
  professional: 'Professional',
  personal: 'Personal',
  knowledge: 'Knowledge Base',
  notes: 'Notes',
};

const statusConfig: Record<DocumentStatus, { label: string; color: string; bgColor: string }> = {
  pending: {
    label: 'Pending',
    color: 'text-slate-700 dark:text-slate-300',
    bgColor: 'bg-slate-100 dark:bg-slate-700',
  },
  processing: {
    label: 'Processing',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/50',
  },
  completed: {
    label: 'Completed',
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/50',
  },
  failed: {
    label: 'Failed',
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/50',
  },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMimeTypeLabel(mimeType: string): string {
  const labels: Record<string, string> = {
    'application/pdf': 'PDF Document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document (DOCX)',
    'text/plain': 'Plain Text',
    'text/markdown': 'Markdown',
    'text/html': 'HTML',
  };
  return labels[mimeType] || mimeType;
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const documentId = params?.id as string;

  const [document, setDocument] = useState<UploadedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocument = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}`);
      const data = await response.json() as {
        success?: boolean;
        document?: UploadedDocument;
        error?: string
      };

      if (data.success && data.document) {
        setDocument(data.document);
        setError(null);
      } else if (response.status === 404) {
        setError('Document not found');
      } else {
        setError(data.error || 'Failed to load document');
      }
    } catch (err) {
      console.error('Failed to fetch document:', err);
      setError('Failed to load document');
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (documentId) {
      fetchDocument();
    }
  }, [documentId, fetchDocument]);

  // Poll for status updates if document is processing
  useEffect(() => {
    if (!document || (document.status !== 'pending' && document.status !== 'processing')) {
      return;
    }

    const interval = setInterval(() => {
      fetchDocument();
    }, 3000);

    return () => clearInterval(interval);
  }, [document, fetchDocument]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      const data = await response.json() as { success?: boolean; error?: string };

      if (data.success) {
        toast({
          variant: 'success',
          title: 'Document Deleted',
          description: 'Document and associated knowledge removed',
        });
        router.push('/knowledge');
      } else {
        toast({
          variant: 'error',
          title: 'Error',
          description: data.error || 'Failed to delete document',
        });
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
      toast({
        variant: 'error',
        title: 'Error',
        description: 'Failed to delete document',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
          <div className="h-60 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
          <svg
            className="mx-auto h-12 w-12 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-red-800 dark:text-red-300">
            {error || 'Document not found'}
          </h3>
          <Link
            href="/knowledge"
            className="mt-4 inline-block text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            Back to Knowledge
          </Link>
        </div>
      </div>
    );
  }

  const status = statusConfig[document.status];

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Back link */}
      <Link
        href="/knowledge"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Knowledge
      </Link>

      {/* Document Header */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-xl font-bold text-slate-900 dark:text-white">
              {document.originalName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${status.bgColor} ${status.color}`}>
                {document.status === 'processing' && (
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {status.label}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {categoryLabels[document.category]}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="ml-4 flex gap-2">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600 dark:text-red-400">Delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Yes'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Error message for failed documents */}
        {document.status === 'failed' && document.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-start gap-2">
              <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-red-800 dark:text-red-300">Processing Failed</h4>
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{document.error}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Document Details */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Details</h2>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">File Type</dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">{getMimeTypeLabel(document.mimeType)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">File Size</dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">{formatFileSize(document.sizeBytes)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">Uploaded</dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">{formatDate(document.uploadedAt)}</dd>
          </div>
          {document.processedAt && (
            <div>
              <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">Processed</dt>
              <dd className="mt-1 text-sm text-slate-900 dark:text-white">{formatDate(document.processedAt)}</dd>
            </div>
          )}
          {document.chunkCount !== undefined && document.status === 'completed' && (
            <div>
              <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">Knowledge Chunks</dt>
              <dd className="mt-1 text-sm text-slate-900 dark:text-white">{document.chunkCount} chunks indexed</dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">Document ID</dt>
            <dd className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-400">{document.id}</dd>
          </div>
        </dl>
      </div>

      {/* Processing info for completed documents */}
      {document.status === 'completed' && document.chunkCount && document.chunkCount > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <h3 className="font-medium text-green-800 dark:text-green-300">Successfully Processed</h3>
              <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                This document has been processed and {document.chunkCount} knowledge chunks have been
                indexed. Your AI clone will use this information when answering questions about you.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Processing status for pending/processing documents */}
      {(document.status === 'pending' || document.status === 'processing') && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div>
              <h3 className="font-medium text-blue-800 dark:text-blue-300">
                {document.status === 'pending' ? 'Waiting to Process' : 'Processing Document'}
              </h3>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
                {document.status === 'pending'
                  ? 'Your document is queued and will be processed shortly.'
                  : 'Your document is being analyzed and indexed. This may take a few moments.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
