/**
 * Document Parser
 * Multi-format document parsing for PDF, DOCX, TXT, MD, HTML
 */

import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { ALLOWED_DOCUMENT_MIME_TYPES } from '@secondme/shared-types';

/**
 * Parsed document result with text and metadata
 */
export interface ParsedDocument {
  /** Extracted text content */
  text: string;
  /** Document metadata */
  metadata: {
    /** Document title if available */
    title?: string;
    /** Author if available */
    author?: string;
    /** Number of pages (for PDF) */
    pageCount?: number;
    /** Total word count */
    wordCount: number;
  };
}

/**
 * Parse a document from base64 content
 *
 * @param contentBase64 - Base64-encoded file content
 * @param mimeType - MIME type of the document
 * @returns Parsed document with text and metadata
 */
export async function parseDocument(
  contentBase64: string,
  mimeType: string
): Promise<ParsedDocument> {
  const extension = ALLOWED_DOCUMENT_MIME_TYPES.get(mimeType);

  if (!extension) {
    throw new Error(`Unsupported document type: ${mimeType}`);
  }

  const buffer = Buffer.from(contentBase64, 'base64');

  switch (extension) {
    case 'pdf':
      return parsePdf(buffer);
    case 'docx':
      return parseDocx(buffer);
    case 'txt':
      return parsePlainText(buffer);
    case 'md':
      return parseMarkdown(buffer);
    case 'html':
      return parseHtml(buffer);
    default:
      throw new Error(`Parser not implemented for: ${extension}`);
  }
}

/**
 * Parse PDF document
 */
async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const data = await pdf(buffer);

    const text = data.text.trim();
    const wordCount = countWords(text);

    return {
      text,
      metadata: {
        title: data.info?.Title || undefined,
        author: data.info?.Author || undefined,
        pageCount: data.numpages,
        wordCount,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to parse PDF: ${message}`);
  }
}

/**
 * Parse DOCX document
 */
async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const result = await mammoth.extractRawText({ buffer });

    const text = result.value.trim();
    const wordCount = countWords(text);

    // Log any warnings
    if (result.messages.length > 0) {
      console.warn('[DocumentParser] DOCX warnings:', result.messages);
    }

    return {
      text,
      metadata: {
        wordCount,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to parse DOCX: ${message}`);
  }
}

/**
 * Parse plain text document (TXT)
 */
function parsePlainText(buffer: Buffer): ParsedDocument {
  const text = buffer.toString('utf-8').trim();
  const wordCount = countWords(text);

  return {
    text,
    metadata: {
      wordCount,
    },
  };
}

/**
 * Parse markdown document
 * Extracts text content, preserving some structure
 */
function parseMarkdown(buffer: Buffer): ParsedDocument {
  let text = buffer.toString('utf-8').trim();

  // Extract title from first heading if present
  const titleMatch = text.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1] ?? undefined;

  // Remove code blocks (preserve their content but remove backticks)
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```\w*\n?/g, '').trim();
  });

  // Remove inline code markers
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove markdown links but keep text [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove image syntax ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Remove emphasis markers (* and _)
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');

  // Remove heading markers
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}$/gm, '');

  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  const wordCount = countWords(text);

  const metadata: ParsedDocument['metadata'] = { wordCount };
  if (title) {
    metadata.title = title;
  }

  return { text, metadata };
}

/**
 * Parse HTML document
 * Strips tags and extracts text content
 */
function parseHtml(buffer: Buffer): ParsedDocument {
  let text = buffer.toString('utf-8');

  // Extract title from <title> tag if present
  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim();

  // Remove script and style elements
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Replace block elements with newlines
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr|td|th|blockquote|pre)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Clean up whitespace
  text = text
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const wordCount = countWords(text);

  const metadata: ParsedDocument['metadata'] = { wordCount };
  if (title) {
    metadata.title = title;
  }

  return { text, metadata };
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '...',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }

  // Handle numeric entities
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([a-f\d]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return result;
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}
