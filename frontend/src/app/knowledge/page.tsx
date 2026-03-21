/**
 * Knowledge Management Page
 * Upload and manage personal documents for AI context
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UploadedDocument, DocumentCategory } from '@secondme/shared-types';
import DocumentUpload from '@/components/DocumentUpload';
import DocumentList from '@/components/DocumentList';
import { useToast } from '@/contexts/ToastContext';

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | 'all'>('all');
  const { toast } = useToast();

  const fetchDocuments = useCallback(async () => {
    try {
      const url = selectedCategory === 'all'
        ? '/api/documents'
        : `/api/documents?category=${selectedCategory}`;
      const response = await fetch(url);
      const data = await response.json() as {
        success?: boolean;
        documents?: UploadedDocument[];
        error?: string
      };

      if (data.success && data.documents) {
        setDocuments(data.documents);
      } else {
        toast({
          variant: 'error',
          title: 'Error',
          description: data.error || 'Failed to load documents',
        });
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      toast({
        variant: 'error',
        title: 'Error',
        description: 'Failed to load documents',
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, toast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Poll for status updates on processing documents
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'pending' || d.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents, fetchDocuments]);

  const handleUploadComplete = useCallback((document: UploadedDocument) => {
    setDocuments(prev => [document, ...prev]);
    toast({
      variant: 'success',
      title: 'Document Uploaded',
      description: `${document.originalName} is being processed`,
    });
  }, [toast]);

  const handleDelete = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      const data = await response.json() as { success?: boolean; error?: string };

      if (data.success) {
        setDocuments(prev => prev.filter(d => d.id !== documentId));
        toast({
          variant: 'success',
          title: 'Document Deleted',
          description: 'Document and associated knowledge removed',
        });
      } else {
        toast({
          variant: 'error',
          title: 'Error',
          description: data.error || 'Failed to delete document',
        });
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      toast({
        variant: 'error',
        title: 'Error',
        description: 'Failed to delete document',
      });
    }
  };

  const categories: { value: DocumentCategory | 'all'; label: string }[] = [
    { value: 'all', label: 'All Categories' },
    { value: 'professional', label: 'Professional' },
    { value: 'personal', label: 'Personal' },
    { value: 'knowledge', label: 'Knowledge Base' },
    { value: 'notes', label: 'Notes' },
  ];

  const stats = {
    total: documents.length,
    completed: documents.filter(d => d.status === 'completed').length,
    processing: documents.filter(d => d.status === 'pending' || d.status === 'processing').length,
    failed: documents.filter(d => d.status === 'failed').length,
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Knowledge</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Upload documents to give your AI clone knowledge about you
        </p>
      </div>

      {/* Info box */}
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400"
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
          <div>
            <h3 className="font-medium text-blue-800 dark:text-blue-300">About Knowledge</h3>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
              Upload your resume, bio, expertise notes, or other personal documents. When contacts
              ask questions like &quot;What do you do?&quot; or &quot;Tell me about yourself&quot;,
              your AI clone will reference this information.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Total Documents</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.completed}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Processed</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.processing}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Processing</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Failed</div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Upload Document</h2>
        <DocumentUpload onUploadComplete={handleUploadComplete} />
      </div>

      {/* Documents Section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your Documents</h2>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as DocumentCategory | 'all')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">No Documents Yet</h3>
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              Upload your first document to get started
            </p>
          </div>
        ) : (
          <DocumentList documents={documents} onDelete={handleDelete} />
        )}
      </div>

      {/* Feature note */}
      <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400"
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
          <div>
            <h3 className="font-medium text-amber-800 dark:text-amber-300">Skill Required</h3>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              Make sure the <code className="rounded bg-amber-200/50 px-1 dark:bg-amber-700/30">owner-knowledge</code> skill
              is enabled in the Skills page for your AI clone to use this information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
