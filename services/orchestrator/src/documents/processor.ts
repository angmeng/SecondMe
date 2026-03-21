/**
 * Document Processor
 * Orchestrates document parsing, chunking, fact extraction, and storage
 */

import type {
  QueuedDocument,
  DocumentChunk,
  ExtractedFact,
  DocumentStatus,
} from '@secondme/shared-types';
import { isQueuedDocument } from '@secondme/shared-types';
import { parseDocument } from './parser.js';
import { chunkDocument, mergeSmallChunks } from './chunker.js';
import { getFactExtractor } from './fact-extractor.js';
import { automemClient } from '../automem/client.js';
import { redisClient } from '../redis/client.js';

/**
 * Configuration for document processing
 */
const PROCESSING_CONFIG = {
  /** Concurrency limit for fact extraction (default: 3) */
  factExtractionConcurrency: parseInt(process.env['FACT_EXTRACTION_CONCURRENCY'] || '3', 10),
} as const;

/**
 * Result of document processing
 */
export interface ProcessingResult {
  documentId: string;
  status: DocumentStatus;
  chunkCount: number;
  factsExtracted: number;
  error?: string;
  processingTimeMs: number;
}

/**
 * Document Processor class
 */
export class DocumentProcessor {
  private factExtractor = getFactExtractor();

  /**
   * Process a queued document
   *
   * @param queuedDoc - Document from queue
   * @returns Processing result
   */
  async process(queuedDoc: QueuedDocument): Promise<ProcessingResult> {
    const startTime = Date.now();
    const { documentId, originalName, mimeType, category, contentBase64 } = queuedDoc;

    console.log(`[DocumentProcessor] Processing document ${documentId}: ${originalName}`);

    try {
      // Update status to processing
      await this.updateDocumentStatus(documentId, 'processing');

      // Parse document
      console.log(`[DocumentProcessor] Parsing ${mimeType}...`);
      const parsed = await parseDocument(contentBase64, mimeType);
      console.log(
        `[DocumentProcessor] Parsed ${parsed.metadata.wordCount} words from ${originalName}`
      );

      // Chunk document
      console.log(`[DocumentProcessor] Chunking document...`);
      let chunks = chunkDocument(parsed.text, documentId);

      // Merge small chunks
      chunks = mergeSmallChunks(chunks);
      console.log(`[DocumentProcessor] Created ${chunks.length} chunks`);

      if (chunks.length === 0) {
        return this.completeProcessing(documentId, 0, 0, startTime);
      }

      // Extract facts from chunks (in parallel with concurrency limit)
      console.log(`[DocumentProcessor] Extracting facts...`);
      const chunkContents = chunks.map((c) => c.content);
      const factsMap = await this.factExtractor.extractFactsBatch(
        chunkContents,
        PROCESSING_CONFIG.factExtractionConcurrency
      );

      // Store chunks in AutoMem (with concurrency limit to avoid overwhelming the API)
      let totalFacts = 0;
      const storePromises = chunks.map((chunk, i) => {
        const facts = factsMap.get(i) || [];
        totalFacts += facts.length;
        return () =>
          this.storeChunkInAutoMem(chunk, facts, documentId, originalName, category, chunks.length);
      });

      // Process in batches of 5 concurrent stores
      const STORE_CONCURRENCY = 5;
      for (let i = 0; i < storePromises.length; i += STORE_CONCURRENCY) {
        const batch = storePromises.slice(i, i + STORE_CONCURRENCY);
        await Promise.all(batch.map((fn) => fn()));
      }

      console.log(
        `[DocumentProcessor] Stored ${chunks.length} chunks with ${totalFacts} facts for ${documentId}`
      );

      return this.completeProcessing(documentId, chunks.length, totalFacts, startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DocumentProcessor] Failed to process ${documentId}:`, errorMessage);

      await this.updateDocumentStatus(documentId, 'failed', undefined, errorMessage);

      return {
        documentId,
        status: 'failed',
        chunkCount: 0,
        factsExtracted: 0,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Store a chunk in AutoMem
   */
  private async storeChunkInAutoMem(
    chunk: Omit<DocumentChunk, 'facts'>,
    facts: ExtractedFact[],
    documentId: string,
    filename: string,
    category: string,
    totalChunks: number
  ): Promise<void> {
    if (!automemClient.connected) {
      console.warn('[DocumentProcessor] AutoMem not connected, skipping storage');
      return;
    }

    const content = JSON.stringify({
      text: chunk.content,
      facts: facts,
      source: {
        documentId,
        filename,
        chunkIndex: chunk.chunkIndex,
        totalChunks,
      },
    });

    await automemClient.store({
      content,
      type: 'Context',
      tags: [
        'owner:knowledge',
        `document:${documentId}`,
        `category:${category}`,
        `chunk:${chunk.chunkIndex}`,
      ],
      importance: 0.8,
      metadata: {
        documentId,
        category,
        chunkIndex: chunk.chunkIndex,
        tokenEstimate: chunk.tokenEstimate,
        factCount: facts.length,
      },
    });
  }

  /**
   * Complete processing and update status
   */
  private async completeProcessing(
    documentId: string,
    chunkCount: number,
    factsExtracted: number,
    startTime: number
  ): Promise<ProcessingResult> {
    await this.updateDocumentStatus(documentId, 'completed', chunkCount);

    const processingTimeMs = Date.now() - startTime;
    console.log(
      `[DocumentProcessor] Completed ${documentId} in ${processingTimeMs}ms: ${chunkCount} chunks, ${factsExtracted} facts`
    );

    return {
      documentId,
      status: 'completed',
      chunkCount,
      factsExtracted,
      processingTimeMs,
    };
  }

  /**
   * Update document status in Redis
   */
  private async updateDocumentStatus(
    documentId: string,
    status: DocumentStatus,
    chunkCount?: number,
    error?: string
  ): Promise<void> {
    const key = `DOCS:metadata:${documentId}`;
    const json = await redisClient.client.get(key);

    if (!json) {
      console.warn(`[DocumentProcessor] Document ${documentId} not found in Redis`);
      return;
    }

    try {
      const doc = JSON.parse(json);
      doc.status = status;

      if (status === 'completed') {
        doc.processedAt = Date.now();
        if (chunkCount !== undefined) {
          doc.chunkCount = chunkCount;
        }
      }

      if (error) {
        doc.error = error;
      }

      await redisClient.client.set(key, JSON.stringify(doc));

      // Publish status update for real-time dashboard updates
      await redisClient.publish(
        'documents:status',
        JSON.stringify({
          documentId,
          status,
          chunkCount,
          error,
          timestamp: Date.now(),
        })
      );
    } catch (parseError) {
      console.error(`[DocumentProcessor] Failed to parse document ${documentId}:`, parseError);
    }
  }

  /**
   * Delete document chunks from AutoMem
   *
   * LIMITATION: AutoMem API does not currently support deletion.
   * This method identifies chunks that would be deleted but cannot actually remove them.
   * When documents are deleted from Redis, their chunks remain in AutoMem until:
   * - AutoMem adds a delete-by-tag API
   * - Chunks naturally expire (if TTL is configured)
   * - Manual cleanup is performed
   *
   * @param documentId - Document ID to delete
   * @returns Number of chunks that would be deleted (for reference)
   */
  async deleteFromAutoMem(documentId: string): Promise<number> {
    if (!automemClient.connected) {
      console.warn('[DocumentProcessor] AutoMem not connected, cannot query for delete');
      return 0;
    }

    // Recall all memories with this document tag to count what would be deleted
    const response = await automemClient.recall({
      tags: [`document:${documentId}`],
      tag_mode: 'all',
      tag_match: 'exact',
      limit: 200, // Should be more than enough for any document
    });

    if (response.status !== 'success' || response.count === 0) {
      console.log(`[DocumentProcessor] No chunks found for document ${documentId}`);
      return 0;
    }

    // KNOWN LIMITATION: AutoMem API does not support deletion
    // Log for visibility - chunks remain in AutoMem but will not be retrieved
    // as the document metadata is removed from Redis
    console.warn(
      `[DocumentProcessor] Cannot delete ${response.count} chunks from AutoMem for document ${documentId}. ` +
      `AutoMem delete API not available. Chunks will remain but won't be retrieved.`
    );

    return response.count;
  }
}

/**
 * Parse and validate a queued document from stream message
 */
export function parseQueuedDocument(data: string): QueuedDocument | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (isQueuedDocument(parsed)) {
      return parsed;
    }
    console.warn('[DocumentProcessor] Invalid queued document format');
    return null;
  } catch {
    console.error('[DocumentProcessor] Failed to parse queued document JSON');
    return null;
  }
}

// Singleton instance
let processor: DocumentProcessor | null = null;

/**
 * Get the global document processor instance
 */
export function getDocumentProcessor(): DocumentProcessor {
  if (!processor) {
    processor = new DocumentProcessor();
  }
  return processor;
}
