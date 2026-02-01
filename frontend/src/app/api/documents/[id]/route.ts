/**
 * Document Detail API Route
 * Handles get and delete for specific documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { createAuditLogger } from '@/lib/audit';
import { documentStore } from '@/lib/document-store';

// Orchestrator URL for AutoMem cleanup
const ORCHESTRATOR_URL = process.env['ORCHESTRATOR_URL'] || 'http://localhost:3002';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/documents/[id]
 * Get document details
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const document = await documentStore.get(id);

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      document,
    });
  } catch (error) {
    console.error('[API Documents] Error getting document:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/documents/[id]
 * Delete a document and its chunks from AutoMem
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const audit = createAuditLogger(request);

  try {
    const { id } = await params;

    // Get document to verify it exists
    const document = await documentStore.get(id);

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // If document was processed, delete from AutoMem via orchestrator
    if (document.status === 'completed' && document.chunkCount && document.chunkCount > 0) {
      try {
        const response = await fetch(`${ORCHESTRATOR_URL}/documents/${id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.warn(
            `[API Documents] Failed to delete from AutoMem (status ${response.status}), continuing with local delete`
          );
        }
      } catch (fetchError) {
        // Log but don't fail if orchestrator is unavailable
        console.warn('[API Documents] Orchestrator unavailable for AutoMem cleanup:', fetchError);
      }
    }

    // Delete from Redis
    const deleted = await documentStore.delete(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }

    audit('DELETE_DOCUMENT', 'documents', id, {
      filename: document.originalName,
      category: document.category,
    });

    return NextResponse.json({
      success: true,
      documentId: id,
      action: 'deleted',
    });
  } catch (error) {
    console.error('[API Documents] Error deleting document:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
