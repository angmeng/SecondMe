/**
 * Document Upload Component
 * Drag-and-drop file upload with category selection
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import type { UploadedDocument, DocumentCategory } from '@secondme/shared-types';
import { ALLOWED_DOCUMENT_MIME_TYPES, DEFAULT_DOCUMENT_CONFIG } from '@secondme/shared-types';

interface DocumentUploadProps {
  onUploadComplete: (document: UploadedDocument) => void;
}

export default function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<DocumentCategory>('professional');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories: { value: DocumentCategory; label: string; description: string }[] = [
    { value: 'professional', label: 'Professional', description: 'Resume, CV, work history' },
    { value: 'personal', label: 'Personal', description: 'Bio, interests, background' },
    { value: 'knowledge', label: 'Knowledge Base', description: 'Expertise, skills documentation' },
    { value: 'notes', label: 'Notes', description: 'General notes and references' },
  ];

  const allowedTypes = Array.from(ALLOWED_DOCUMENT_MIME_TYPES.keys());
  const allowedExtensions = Array.from(ALLOWED_DOCUMENT_MIME_TYPES.values());
  const maxSizeBytes = DEFAULT_DOCUMENT_CONFIG.maxSizeBytes;
  const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));

  const validateFile = (file: File): string | null => {
    if (!allowedTypes.includes(file.type)) {
      return `Invalid file type. Allowed: ${allowedExtensions.join(', ')}`;
    }
    if (file.size > maxSizeBytes) {
      return `File too large. Maximum size: ${maxSizeMB}MB`;
    }
    return null;
  };

  const uploadFile = async (file: File) => {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await response.json() as {
        success?: boolean;
        document?: UploadedDocument;
        error?: string
      };

      if (data.success && data.document) {
        onUploadComplete(data.document);
        // Reset form
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to upload document');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadFile(files[0]!);
    }
  }, [category]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]!);
    }
  }, [category]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      {/* Category Selection */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Category
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {categories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`rounded-lg border p-3 text-left transition-all ${
                category === cat.value
                  ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-950/50'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
              }`}
            >
              <div className={`text-sm font-medium ${
                category === cat.value
                  ? 'text-primary-700 dark:text-primary-300'
                  : 'text-slate-900 dark:text-white'
              }`}>
                {cat.label}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {cat.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all ${
          isDragging
            ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-950/50'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800/50 dark:hover:border-slate-500'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={allowedTypes.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />

        {isUploading ? (
          <div className="space-y-3">
            <svg
              className="mx-auto h-10 w-10 animate-spin text-primary-500"
              fill="none"
              viewBox="0 0 24 24"
            >
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
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Uploading... {uploadProgress}%
            </div>
            <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full bg-primary-500 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <svg
              className="mx-auto h-10 w-10 text-slate-400"
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
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
              Drop a file here or click to browse
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {allowedExtensions.map(ext => ext.toUpperCase()).join(', ')} up to {maxSizeMB}MB
            </p>
          </>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-red-600 dark:text-red-400"
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
            <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
