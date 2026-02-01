/**
 * Document Chunker
 * Splits documents into chunks for processing and storage
 */

import type { DocumentChunk } from '@secondme/shared-types';
import { DEFAULT_DOCUMENT_CONFIG } from '@secondme/shared-types';

/**
 * Configuration for chunking
 */
export interface ChunkerConfig {
  /** Target chunk size in tokens (approximate) */
  targetTokens: number;
  /** Overlap between chunks in tokens */
  overlapTokens: number;
  /** Maximum chunks per document */
  maxChunks: number;
}

const DEFAULT_CHUNKER_CONFIG: ChunkerConfig = {
  targetTokens: DEFAULT_DOCUMENT_CONFIG.targetChunkTokens,
  overlapTokens: DEFAULT_DOCUMENT_CONFIG.chunkOverlapTokens,
  maxChunks: DEFAULT_DOCUMENT_CONFIG.maxChunksPerDocument,
};

/**
 * Estimate token count from text
 * Rough approximation: 1 token ≈ 4 characters for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split document text into chunks
 *
 * @param text - Document text content
 * @param documentId - Parent document ID
 * @param config - Optional chunking configuration
 * @returns Array of document chunks
 */
export function chunkDocument(
  text: string,
  documentId: string,
  config: Partial<ChunkerConfig> = {}
): Omit<DocumentChunk, 'facts'>[] {
  const { targetTokens, overlapTokens, maxChunks } = {
    ...DEFAULT_CHUNKER_CONFIG,
    ...config,
  };

  // Convert token targets to character counts (approximate)
  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  // Split text into paragraphs
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: Omit<DocumentChunk, 'facts'>[] = [];
  let currentChunkContent: string[] = [];
  let currentChunkLength = 0;

  for (const paragraph of paragraphs) {
    const paragraphLength = paragraph.length;

    // If single paragraph is larger than target, split it
    if (paragraphLength > targetChars) {
      // First, flush current chunk if not empty
      if (currentChunkContent.length > 0) {
        chunks.push(createChunk(currentChunkContent, documentId, chunks.length));
        currentChunkContent = [];
        currentChunkLength = 0;
      }

      // Split large paragraph by sentences
      const sentences = splitIntoSentences(paragraph);
      let sentenceChunk: string[] = [];
      let sentenceChunkLength = 0;

      for (const sentence of sentences) {
        if (sentenceChunkLength + sentence.length > targetChars && sentenceChunk.length > 0) {
          chunks.push(createChunk([sentenceChunk.join(' ')], documentId, chunks.length));

          // Keep overlap from previous chunk
          const overlapContent = getOverlapContent(sentenceChunk.join(' '), overlapChars);
          sentenceChunk = overlapContent ? [overlapContent] : [];
          sentenceChunkLength = overlapContent?.length || 0;
        }

        sentenceChunk.push(sentence);
        sentenceChunkLength += sentence.length;
      }

      // Add remaining sentences
      if (sentenceChunk.length > 0) {
        currentChunkContent = sentenceChunk;
        currentChunkLength = sentenceChunkLength;
      }
      continue;
    }

    // Check if adding paragraph exceeds target
    if (currentChunkLength + paragraphLength > targetChars && currentChunkContent.length > 0) {
      chunks.push(createChunk(currentChunkContent, documentId, chunks.length));

      // Keep overlap from previous chunk
      const overlapContent = getOverlapContent(currentChunkContent.join('\n\n'), overlapChars);
      currentChunkContent = overlapContent ? [overlapContent] : [];
      currentChunkLength = overlapContent?.length || 0;
    }

    currentChunkContent.push(paragraph);
    currentChunkLength += paragraphLength;

    // Check max chunks limit
    if (chunks.length >= maxChunks - 1 && currentChunkContent.length > 0) {
      // Combine remaining paragraphs into final chunk
      const remainingParagraphs = paragraphs.slice(paragraphs.indexOf(paragraph) + 1);
      if (remainingParagraphs.length > 0) {
        currentChunkContent.push(...remainingParagraphs);
      }
      break;
    }
  }

  // Add final chunk
  if (currentChunkContent.length > 0) {
    chunks.push(createChunk(currentChunkContent, documentId, chunks.length));
  }

  return chunks.slice(0, maxChunks);
}

/**
 * Create a chunk object from content
 */
function createChunk(
  content: string[],
  documentId: string,
  index: number
): Omit<DocumentChunk, 'facts'> {
  const text = content.join('\n\n').trim();

  return {
    id: `${documentId}_chunk_${index}`,
    documentId,
    content: text,
    chunkIndex: index,
    tokenEstimate: estimateTokens(text),
  };
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries, keeping the delimiter
  const sentences = text.split(/(?<=[.!?])\s+/);

  return sentences
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Get overlap content from the end of text
 */
function getOverlapContent(text: string, targetLength: number): string | null {
  if (text.length <= targetLength) {
    return text;
  }

  // Try to break at sentence boundary
  const lastPart = text.slice(-targetLength * 2);
  const sentenceBreak = lastPart.lastIndexOf('. ');

  if (sentenceBreak > targetLength / 2) {
    return lastPart.slice(sentenceBreak + 2);
  }

  // Fall back to word boundary
  const wordBreak = text.slice(-targetLength).indexOf(' ');
  if (wordBreak > 0) {
    return text.slice(-targetLength + wordBreak + 1);
  }

  return null;
}

/**
 * Merge small chunks together
 * Useful for post-processing if chunks are too small
 */
export function mergeSmallChunks(
  chunks: Omit<DocumentChunk, 'facts'>[],
  minTokens: number = 100
): Omit<DocumentChunk, 'facts'>[] {
  const merged: Omit<DocumentChunk, 'facts'>[] = [];
  let accumulator: Omit<DocumentChunk, 'facts'> | null = null;

  for (const chunk of chunks) {
    if (!accumulator) {
      accumulator = { ...chunk };
      continue;
    }

    if (accumulator.tokenEstimate < minTokens) {
      // Merge with current chunk
      accumulator = {
        ...accumulator,
        content: accumulator.content + '\n\n' + chunk.content,
        tokenEstimate: accumulator.tokenEstimate + chunk.tokenEstimate,
      };
    } else {
      merged.push(accumulator);
      accumulator = { ...chunk };
    }
  }

  if (accumulator) {
    merged.push(accumulator);
  }

  // Re-index chunks
  return merged.map((chunk, index) => ({
    ...chunk,
    id: `${chunk.documentId}_chunk_${index}`,
    chunkIndex: index,
  }));
}
