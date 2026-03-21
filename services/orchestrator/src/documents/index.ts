/**
 * Documents Module
 * Personal knowledge upload - document processing for owner context
 */

// Parser
export { parseDocument } from './parser.js';
export type { ParsedDocument } from './parser.js';

// Chunker
export { chunkDocument, mergeSmallChunks, estimateTokens } from './chunker.js';

// Fact Extractor
export { FactExtractor, getFactExtractor, resetFactExtractor } from './fact-extractor.js';

// Processor
export { DocumentProcessor, getDocumentProcessor, parseQueuedDocument } from './processor.js';
export type { ProcessingResult } from './processor.js';

// Consumer
export {
  startDocumentConsumer,
  stopDocumentConsumer,
  getConsumerStats,
} from './consumer.js';
