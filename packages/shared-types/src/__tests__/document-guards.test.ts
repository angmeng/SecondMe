/**
 * Document Type Guards Tests
 * Unit tests for document-related runtime type guards
 */

import { describe, it, expect } from 'vitest';
import {
  isDocumentCategory,
  isDocumentStatus,
  isExtractedFact,
  isUploadedDocument,
  isQueuedDocument,
} from '../guards.js';

describe('isDocumentCategory', () => {
  it('should return true for valid categories', () => {
    expect(isDocumentCategory('professional')).toBe(true);
    expect(isDocumentCategory('personal')).toBe(true);
    expect(isDocumentCategory('knowledge')).toBe(true);
    expect(isDocumentCategory('notes')).toBe(true);
  });

  it('should return false for invalid categories', () => {
    expect(isDocumentCategory('invalid')).toBe(false);
    expect(isDocumentCategory('work')).toBe(false);
    expect(isDocumentCategory('')).toBe(false);
  });

  it('should return false for non-string values', () => {
    expect(isDocumentCategory(null)).toBe(false);
    expect(isDocumentCategory(undefined)).toBe(false);
    expect(isDocumentCategory(123)).toBe(false);
    expect(isDocumentCategory({})).toBe(false);
    expect(isDocumentCategory([])).toBe(false);
  });
});

describe('isDocumentStatus', () => {
  it('should return true for valid statuses', () => {
    expect(isDocumentStatus('pending')).toBe(true);
    expect(isDocumentStatus('processing')).toBe(true);
    expect(isDocumentStatus('completed')).toBe(true);
    expect(isDocumentStatus('failed')).toBe(true);
  });

  it('should return false for invalid statuses', () => {
    expect(isDocumentStatus('invalid')).toBe(false);
    expect(isDocumentStatus('uploading')).toBe(false);
    expect(isDocumentStatus('')).toBe(false);
  });

  it('should return false for non-string values', () => {
    expect(isDocumentStatus(null)).toBe(false);
    expect(isDocumentStatus(undefined)).toBe(false);
    expect(isDocumentStatus(123)).toBe(false);
    expect(isDocumentStatus({})).toBe(false);
  });
});

describe('isExtractedFact', () => {
  const validFact = {
    type: 'skill',
    content: 'Python programming',
    confidence: 0.95,
  };

  it('should return true for valid facts', () => {
    expect(isExtractedFact(validFact)).toBe(true);
  });

  it('should return true for all valid types', () => {
    expect(isExtractedFact({ ...validFact, type: 'skill' })).toBe(true);
    expect(isExtractedFact({ ...validFact, type: 'experience' })).toBe(true);
    expect(isExtractedFact({ ...validFact, type: 'education' })).toBe(true);
    expect(isExtractedFact({ ...validFact, type: 'interest' })).toBe(true);
    expect(isExtractedFact({ ...validFact, type: 'achievement' })).toBe(true);
    expect(isExtractedFact({ ...validFact, type: 'general' })).toBe(true);
  });

  it('should return true for boundary confidence values', () => {
    expect(isExtractedFact({ ...validFact, confidence: 0 })).toBe(true);
    expect(isExtractedFact({ ...validFact, confidence: 1 })).toBe(true);
    expect(isExtractedFact({ ...validFact, confidence: 0.5 })).toBe(true);
  });

  it('should return false for invalid type', () => {
    expect(isExtractedFact({ ...validFact, type: 'invalid' })).toBe(false);
    expect(isExtractedFact({ ...validFact, type: 'work' })).toBe(false);
  });

  it('should return false for invalid confidence', () => {
    expect(isExtractedFact({ ...validFact, confidence: -0.1 })).toBe(false);
    expect(isExtractedFact({ ...validFact, confidence: 1.1 })).toBe(false);
    expect(isExtractedFact({ ...validFact, confidence: 2 })).toBe(false);
  });

  it('should return false for missing fields', () => {
    expect(isExtractedFact({ type: 'skill', content: 'test' })).toBe(false);
    expect(isExtractedFact({ type: 'skill', confidence: 0.9 })).toBe(false);
    expect(isExtractedFact({ content: 'test', confidence: 0.9 })).toBe(false);
  });

  it('should return false for non-object values', () => {
    expect(isExtractedFact(null)).toBe(false);
    expect(isExtractedFact(undefined)).toBe(false);
    expect(isExtractedFact('string')).toBe(false);
    expect(isExtractedFact(123)).toBe(false);
  });
});

describe('isUploadedDocument', () => {
  const validDocument = {
    id: 'doc_123',
    filename: 'resume.pdf',
    originalName: 'My Resume.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 102400,
    category: 'professional',
    uploadedAt: Date.now(),
    status: 'pending',
  };

  it('should return true for valid document', () => {
    expect(isUploadedDocument(validDocument)).toBe(true);
  });

  it('should return true for document with all optional fields', () => {
    const fullDocument = {
      ...validDocument,
      status: 'completed',
      processedAt: Date.now(),
      chunkCount: 5,
    };
    expect(isUploadedDocument(fullDocument)).toBe(true);
  });

  it('should return true for failed document with error', () => {
    const failedDocument = {
      ...validDocument,
      status: 'failed',
      error: 'Failed to parse PDF',
    };
    expect(isUploadedDocument(failedDocument)).toBe(true);
  });

  it('should return true for all valid statuses', () => {
    expect(isUploadedDocument({ ...validDocument, status: 'pending' })).toBe(true);
    expect(isUploadedDocument({ ...validDocument, status: 'processing' })).toBe(true);
    expect(isUploadedDocument({ ...validDocument, status: 'completed' })).toBe(true);
    expect(isUploadedDocument({ ...validDocument, status: 'failed' })).toBe(true);
  });

  it('should return true for all valid categories', () => {
    expect(isUploadedDocument({ ...validDocument, category: 'professional' })).toBe(true);
    expect(isUploadedDocument({ ...validDocument, category: 'personal' })).toBe(true);
    expect(isUploadedDocument({ ...validDocument, category: 'knowledge' })).toBe(true);
    expect(isUploadedDocument({ ...validDocument, category: 'notes' })).toBe(true);
  });

  it('should return false for missing required fields', () => {
    expect(isUploadedDocument({ ...validDocument, id: undefined })).toBe(false);
    expect(isUploadedDocument({ ...validDocument, filename: undefined })).toBe(false);
    expect(isUploadedDocument({ ...validDocument, originalName: undefined })).toBe(false);
    expect(isUploadedDocument({ ...validDocument, mimeType: undefined })).toBe(false);
    expect(isUploadedDocument({ ...validDocument, sizeBytes: undefined })).toBe(false);
    expect(isUploadedDocument({ ...validDocument, category: undefined })).toBe(false);
    expect(isUploadedDocument({ ...validDocument, uploadedAt: undefined })).toBe(false);
    expect(isUploadedDocument({ ...validDocument, status: undefined })).toBe(false);
  });

  it('should return false for invalid category', () => {
    expect(isUploadedDocument({ ...validDocument, category: 'invalid' })).toBe(false);
  });

  it('should return false for invalid status', () => {
    expect(isUploadedDocument({ ...validDocument, status: 'invalid' })).toBe(false);
  });

  it('should return false for wrong types', () => {
    expect(isUploadedDocument({ ...validDocument, sizeBytes: '102400' })).toBe(false);
    expect(isUploadedDocument({ ...validDocument, uploadedAt: '2024-01-01' })).toBe(false);
    expect(isUploadedDocument({ ...validDocument, chunkCount: '5' })).toBe(false);
  });

  it('should return false for non-object values', () => {
    expect(isUploadedDocument(null)).toBe(false);
    expect(isUploadedDocument(undefined)).toBe(false);
    expect(isUploadedDocument('string')).toBe(false);
    expect(isUploadedDocument(123)).toBe(false);
    expect(isUploadedDocument([])).toBe(false);
  });
});

describe('isQueuedDocument', () => {
  const validQueuedDoc = {
    documentId: 'doc_123',
    originalName: 'Resume.pdf',
    mimeType: 'application/pdf',
    category: 'professional',
    contentBase64: 'base64encodedcontent',
    uploadedAt: Date.now(),
  };

  it('should return true for valid queued document', () => {
    expect(isQueuedDocument(validQueuedDoc)).toBe(true);
  });

  it('should return true for all valid categories', () => {
    expect(isQueuedDocument({ ...validQueuedDoc, category: 'professional' })).toBe(true);
    expect(isQueuedDocument({ ...validQueuedDoc, category: 'personal' })).toBe(true);
    expect(isQueuedDocument({ ...validQueuedDoc, category: 'knowledge' })).toBe(true);
    expect(isQueuedDocument({ ...validQueuedDoc, category: 'notes' })).toBe(true);
  });

  it('should return false for missing required fields', () => {
    expect(isQueuedDocument({ ...validQueuedDoc, documentId: undefined })).toBe(false);
    expect(isQueuedDocument({ ...validQueuedDoc, originalName: undefined })).toBe(false);
    expect(isQueuedDocument({ ...validQueuedDoc, mimeType: undefined })).toBe(false);
    expect(isQueuedDocument({ ...validQueuedDoc, category: undefined })).toBe(false);
    expect(isQueuedDocument({ ...validQueuedDoc, contentBase64: undefined })).toBe(false);
    expect(isQueuedDocument({ ...validQueuedDoc, uploadedAt: undefined })).toBe(false);
  });

  it('should return false for invalid category', () => {
    expect(isQueuedDocument({ ...validQueuedDoc, category: 'invalid' })).toBe(false);
  });

  it('should return false for wrong types', () => {
    expect(isQueuedDocument({ ...validQueuedDoc, documentId: 123 })).toBe(false);
    expect(isQueuedDocument({ ...validQueuedDoc, uploadedAt: '2024-01-01' })).toBe(false);
  });

  it('should return false for non-object values', () => {
    expect(isQueuedDocument(null)).toBe(false);
    expect(isQueuedDocument(undefined)).toBe(false);
    expect(isQueuedDocument('string')).toBe(false);
    expect(isQueuedDocument(123)).toBe(false);
    expect(isQueuedDocument([])).toBe(false);
  });
});
