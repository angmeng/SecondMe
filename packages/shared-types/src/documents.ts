/**
 * Shared Document Types
 * Types for personal knowledge upload feature - storing owner's documents
 * for AI context when responding to contacts.
 */

/**
 * Document categories for organization
 * - professional: Work history, resume, certifications
 * - personal: Bio, interests, personal info
 * - knowledge: Domain expertise, technical knowledge
 * - notes: General notes and miscellaneous
 */
export type DocumentCategory = 'professional' | 'personal' | 'knowledge' | 'notes';

/**
 * Document processing status
 * - pending: Uploaded, waiting for processing
 * - processing: Currently being processed
 * - completed: Successfully processed and indexed
 * - failed: Processing failed (error stored)
 */
export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Uploaded document metadata
 * Stored in Redis for tracking and dashboard display
 */
export interface UploadedDocument {
  /** Unique document identifier */
  id: string;
  /** Sanitized filename for storage reference */
  filename: string;
  /** Original filename as uploaded */
  originalName: string;
  /** MIME type of the document */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Document category for organization */
  category: DocumentCategory;
  /** Unix timestamp when uploaded (ms) */
  uploadedAt: number;
  /** Unix timestamp when processing completed (ms) */
  processedAt?: number;
  /** Current processing status */
  status: DocumentStatus;
  /** Number of chunks created after processing */
  chunkCount?: number;
  /** Error message if processing failed */
  error?: string;
}

/**
 * Document chunk after splitting
 * Used during processing pipeline
 */
export interface DocumentChunk {
  /** Unique chunk identifier */
  id: string;
  /** Parent document ID */
  documentId: string;
  /** Text content of this chunk */
  content: string;
  /** Zero-based index in document */
  chunkIndex: number;
  /** Estimated token count for context management */
  tokenEstimate: number;
  /** Extracted facts from this chunk */
  facts?: ExtractedFact[];
}

/**
 * Fact extracted from document content
 * Used to enrich knowledge for retrieval
 */
export interface ExtractedFact {
  /** Type of fact for categorization */
  type: 'skill' | 'experience' | 'education' | 'interest' | 'achievement' | 'general';
  /** The fact content */
  content: string;
  /** Confidence score (0-1) from extraction */
  confidence: number;
}

/**
 * Queue message format for document processing
 * Includes file content as base64 to avoid shared filesystem
 */
export interface QueuedDocument {
  /** Document ID for tracking */
  documentId: string;
  /** Original filename */
  originalName: string;
  /** MIME type for parsing */
  mimeType: string;
  /** Document category */
  category: DocumentCategory;
  /** File content encoded as base64 */
  contentBase64: string;
  /** Unix timestamp when uploaded (ms) */
  uploadedAt: number;
}

/**
 * Document status update event
 * Published via Redis pub/sub for real-time dashboard updates
 */
export interface DocumentStatusEvent {
  /** Document ID */
  documentId: string;
  /** New status */
  status: DocumentStatus;
  /** Chunk count (if completed) */
  chunkCount?: number;
  /** Error message (if failed) */
  error?: string;
  /** Unix timestamp of update (ms) */
  timestamp: number;
}

/**
 * Allowed MIME types for document upload
 */
export const ALLOWED_DOCUMENT_MIME_TYPES = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['text/plain', 'txt'],
  ['text/markdown', 'md'],
  ['text/html', 'html'],
]);

/**
 * Document upload configuration defaults
 */
export const DEFAULT_DOCUMENT_CONFIG = {
  /** Maximum file size in bytes (10MB) */
  maxSizeBytes: 10 * 1024 * 1024,
  /** Target chunk size in tokens */
  targetChunkTokens: 600,
  /** Overlap between chunks in tokens */
  chunkOverlapTokens: 50,
  /** Maximum chunks per document */
  maxChunksPerDocument: 100,
} as const;

/**
 * Document configuration interface
 */
export interface DocumentConfig {
  /** Maximum file size in bytes */
  maxSizeBytes: number;
  /** Target chunk size in tokens */
  targetChunkTokens: number;
  /** Overlap between chunks in tokens */
  chunkOverlapTokens: number;
  /** Maximum chunks per document */
  maxChunksPerDocument: number;
}
