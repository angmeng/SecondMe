/**
 * Documents API Route
 * Handles document upload and listing
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getErrorMessage } from '@/lib/errors';
import { createAuditLogger } from '@/lib/audit';
import { documentStore } from '@/lib/document-store';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DEFAULT_DOCUMENT_CONFIG,
  isDocumentCategory,
} from '@secondme/shared-types';
import type { DocumentCategory, UploadedDocument } from '@secondme/shared-types';

// Feature flag
const DOCUMENT_UPLOAD_ENABLED = process.env['DOCUMENT_UPLOAD_ENABLED'] !== 'false';

// Max file size from env or default
const MAX_SIZE_BYTES =
  parseInt(process.env['DOCUMENT_MAX_SIZE_MB'] || '10', 10) * 1024 * 1024 ||
  DEFAULT_DOCUMENT_CONFIG.maxSizeBytes;

/**
 * GET /api/documents
 * List all uploaded documents
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as DocumentCategory | null;
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Validate category if provided
    if (category && !isDocumentCategory(category)) {
      return NextResponse.json(
        { error: 'Invalid category. Must be professional, personal, knowledge, or notes' },
        { status: 400 }
      );
    }

    const documents = await documentStore.list({
      category: category || undefined,
      limit,
      offset,
    });

    const count = await documentStore.count(category || undefined);

    return NextResponse.json({
      success: true,
      documents,
      count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[API Documents] Error listing documents:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/documents
 * Upload a new document
 */
export async function POST(request: NextRequest) {
  const audit = createAuditLogger(request);

  // Check feature flag
  if (!DOCUMENT_UPLOAD_ENABLED) {
    return NextResponse.json({ error: 'Document upload is disabled' }, { status: 403 });
  }

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = formData.get('category') as string | null;

    // Validate file
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate MIME type
    const extension = ALLOWED_DOCUMENT_MIME_TYPES.get(file.type);
    if (!extension) {
      const allowedTypes = Array.from(ALLOWED_DOCUMENT_MIME_TYPES.keys()).join(', ');
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed types: ${allowedTypes}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_SIZE_BYTES) {
      const maxMB = MAX_SIZE_BYTES / (1024 * 1024);
      return NextResponse.json(
        { error: `File too large. Maximum size is ${maxMB}MB` },
        { status: 400 }
      );
    }

    // Validate category (type guard narrows to DocumentCategory)
    if (!category || !isDocumentCategory(category)) {
      return NextResponse.json(
        { error: 'Invalid category. Must be professional, personal, knowledge, or notes' },
        { status: 400 }
      );
    }
    // After validation, category is narrowed to DocumentCategory
    const validatedCategory: DocumentCategory = category;

    // Generate document ID (first segment of UUID = 8 hex chars)
    const uuidParts = randomUUID().split('-');
    const documentId = uuidParts[0] ?? randomUUID().replace(/-/g, '').slice(0, 8);
    const sanitizedFilename = `${documentId}.${extension}`;

    // Read file to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentBase64 = buffer.toString('base64');

    // Create document metadata
    const document: Omit<UploadedDocument, 'status'> = {
      id: documentId,
      filename: sanitizedFilename,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      category: validatedCategory,
      uploadedAt: Date.now(),
    };

    // Store metadata and queue for processing
    const createdDocument = await documentStore.create(document, contentBase64);

    audit('UPLOAD_DOCUMENT', 'documents', documentId, {
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      category,
    });

    return NextResponse.json({
      success: true,
      document: createdDocument,
    });
  } catch (error) {
    console.error('[API Documents] Error uploading document:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
