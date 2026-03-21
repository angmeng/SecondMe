/**
 * Document Store for Redis Operations
 *
 * Handles Redis metadata operations for uploaded documents.
 * File content is passed through queue, not stored in Redis.
 */

import type {
  UploadedDocument,
  DocumentCategory,
  DocumentStatus,
  QueuedDocument,
} from '@secondme/shared-types';
import { isUploadedDocument } from '@secondme/shared-types';
import { redisClient } from '@/lib/redis-client';

// Redis key prefixes
const KEYS = {
  metadata: (id: string) => `DOCS:metadata:${id}`,
  list: 'DOCS:list',
  category: (cat: DocumentCategory) => `DOCS:category:${cat}`,
  status: (status: DocumentStatus) => `DOCS:status:${status}`,
  queue: 'QUEUE:documents',
} as const;

/**
 * Document Store class for managing document metadata in Redis
 */
class DocumentStore {
  /**
   * Create a new document record and queue for processing
   *
   * @param document - Document metadata (without status, will be set to 'pending')
   * @param contentBase64 - File content as base64 string
   * @returns Created document record
   */
  async create(
    document: Omit<UploadedDocument, 'status'>,
    contentBase64: string
  ): Promise<UploadedDocument> {
    const client = redisClient.client;

    const fullDocument: UploadedDocument = {
      ...document,
      status: 'pending',
    };

    // Create queue message
    const queuedDocument: QueuedDocument = {
      documentId: document.id,
      originalName: document.originalName,
      mimeType: document.mimeType,
      category: document.category,
      contentBase64,
      uploadedAt: document.uploadedAt,
    };

    // Use pipeline for atomic operations
    const pipeline = client.pipeline();

    // Store metadata
    pipeline.set(KEYS.metadata(document.id), JSON.stringify(fullDocument));

    // Add to sorted set (score = uploadedAt for chronological ordering)
    pipeline.zadd(KEYS.list, document.uploadedAt, document.id);

    // Add to category set
    pipeline.sadd(KEYS.category(document.category), document.id);

    // Add to status index (for efficient status queries)
    pipeline.sadd(KEYS.status('pending'), document.id);

    // Queue for processing via XADD
    pipeline.xadd(KEYS.queue, '*', 'data', JSON.stringify(queuedDocument));

    await pipeline.exec();

    console.log(`[DocumentStore] Created document ${document.id} and queued for processing`);

    return fullDocument;
  }

  /**
   * Get a document by ID
   *
   * @param id - Document ID
   * @returns Document or null if not found
   */
  async get(id: string): Promise<UploadedDocument | null> {
    const client = redisClient.client;
    const json = await client.get(KEYS.metadata(id));

    if (!json) return null;

    try {
      const parsed: unknown = JSON.parse(json);
      if (isUploadedDocument(parsed)) {
        return parsed;
      }
      console.warn(`[DocumentStore] Invalid document format for ${id}`);
      return null;
    } catch {
      console.error(`[DocumentStore] Failed to parse document ${id}`);
      return null;
    }
  }

  /**
   * List all documents, optionally filtered by category
   *
   * @param options - Filter and pagination options
   * @returns Array of documents sorted by upload date (newest first)
   */
  async list(options?: {
    category?: DocumentCategory;
    limit?: number;
    offset?: number;
  }): Promise<UploadedDocument[]> {
    const client = redisClient.client;
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    let documentIds: string[];

    if (options?.category) {
      // Get IDs from category set, then sort by uploadedAt
      const categoryIds = await client.smembers(KEYS.category(options.category));
      if (categoryIds.length === 0) return [];

      // Get scores (uploadedAt) for sorting
      const scores = await client.zmscore(KEYS.list, categoryIds);
      const idsWithScores = categoryIds
        .map((id, i) => {
          const scoreStr = scores[i] ?? null;
          return { id, score: scoreStr !== null ? parseFloat(scoreStr) : 0 };
        })
        .filter((item) => item.score !== 0)
        .sort((a, b) => b.score - a.score);

      documentIds = idsWithScores.slice(offset, offset + limit).map((item) => item.id);
    } else {
      // Get from sorted set directly (ZREVRANGE for newest first)
      documentIds = await client.zrevrange(KEYS.list, offset, offset + limit - 1);
    }

    if (documentIds.length === 0) return [];

    return this.fetchDocuments(documentIds);
  }

  /**
   * Update document status
   * Used by orchestrator to update processing progress
   *
   * @param id - Document ID
   * @param status - New status
   * @param details - Additional details (chunkCount, error, processedAt)
   * @returns Updated document or null if not found
   */
  async updateStatus(
    id: string,
    status: DocumentStatus,
    details?: {
      chunkCount?: number;
      error?: string;
      processedAt?: number;
    }
  ): Promise<UploadedDocument | null> {
    const client = redisClient.client;

    const document = await this.get(id);
    if (!document) return null;

    const oldStatus = document.status;
    const updated: UploadedDocument = {
      ...document,
      status,
      ...(details?.chunkCount !== undefined && { chunkCount: details.chunkCount }),
      ...(details?.error !== undefined && { error: details.error }),
      ...(details?.processedAt !== undefined && { processedAt: details.processedAt }),
    };

    // Use pipeline to update metadata and status index atomically
    const pipeline = client.pipeline();
    pipeline.set(KEYS.metadata(id), JSON.stringify(updated));

    // Move document between status sets if status changed
    if (oldStatus !== status) {
      pipeline.srem(KEYS.status(oldStatus), id);
      pipeline.sadd(KEYS.status(status), id);
    }

    await pipeline.exec();

    console.log(`[DocumentStore] Updated document ${id} status to ${status}`);

    return updated;
  }

  /**
   * Delete a document and its metadata
   * Note: AutoMem cleanup must be done separately via orchestrator
   *
   * @param id - Document ID
   * @returns true if document was deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const client = redisClient.client;

    const document = await this.get(id);
    if (!document) return false;

    const pipeline = client.pipeline();

    // Remove metadata
    pipeline.del(KEYS.metadata(id));

    // Remove from sorted set
    pipeline.zrem(KEYS.list, id);

    // Remove from category set
    pipeline.srem(KEYS.category(document.category), id);

    // Remove from status index
    pipeline.srem(KEYS.status(document.status), id);

    await pipeline.exec();

    console.log(`[DocumentStore] Deleted document ${id}`);

    return true;
  }

  /**
   * Get document count, optionally by category
   *
   * @param category - Optional category filter
   * @returns Document count
   */
  async count(category?: DocumentCategory): Promise<number> {
    const client = redisClient.client;

    if (category) {
      return client.scard(KEYS.category(category));
    }

    return client.zcard(KEYS.list);
  }

  /**
   * Get documents by status
   * Uses Redis status index for efficient lookups
   *
   * @param status - Status to filter by
   * @param limit - Maximum number of documents to return (default: 100)
   * @returns Array of documents with the specified status
   */
  async listByStatus(status: DocumentStatus, limit = 100): Promise<UploadedDocument[]> {
    const client = redisClient.client;

    // Get document IDs from status index
    const documentIds = await client.smembers(KEYS.status(status));

    if (documentIds.length === 0) return [];

    // Get scores (uploadedAt) for sorting
    const scores = await client.zmscore(KEYS.list, documentIds);
    const idsWithScores = documentIds
      .map((id, i) => {
        const scoreStr = scores[i] ?? null;
        return { id, score: scoreStr !== null ? parseFloat(scoreStr) : 0 };
      })
      .filter((item) => item.score !== 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (idsWithScores.length === 0) return [];

    return this.fetchDocuments(idsWithScores.map((item) => item.id));
  }

  /**
   * Batch-fetch and parse UploadedDocument records from Redis by document ID.
   * Skips any keys whose values are missing or fail JSON/type validation.
   *
   * @param documentIds - Ordered list of document IDs to fetch
   * @returns Validated UploadedDocument array in the same relative order
   */
  private async fetchDocuments(documentIds: string[]): Promise<UploadedDocument[]> {
    const client = redisClient.client;
    const keys = documentIds.map((id) => KEYS.metadata(id));
    const values = await client.mget(keys);

    const documents: UploadedDocument[] = [];
    for (const json of values) {
      if (json) {
        try {
          const parsed: unknown = JSON.parse(json);
          if (isUploadedDocument(parsed)) {
            documents.push(parsed);
          }
        } catch {
          // Skip invalid entries
        }
      }
    }

    return documents;
  }
}

// Export singleton instance
export const documentStore = new DocumentStore();
