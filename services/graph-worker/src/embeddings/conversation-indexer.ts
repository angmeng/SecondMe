/**
 * Conversation Embedding Indexer
 * Task 5.1.2: Index conversation chunks for semantic retrieval
 *
 * Chunks conversations intelligently by topic/time, generates embeddings,
 * and stores them in AutoMem for semantic search.
 */

import { createHash } from 'crypto';
import { automemClient, type StoreMemoryRequest } from '../automem/client.js';
import { redisClient } from '../redis/client.js';
import { DEFAULT_STOPWORDS } from '../config/stopwords.js';

const SERVICE_NAME = 'Conversation Indexer';

/**
 * Configuration for conversation indexing
 */
export interface ConversationIndexerConfig {
  /** Minimum messages per chunk to index */
  minChunkMessages: number;
  /** Maximum messages per chunk */
  maxChunkMessages: number;
  /** Time gap (minutes) to split chunks */
  gapMinutes: number;
  /** Minimum keyword overlap to keep in same chunk (0-1) */
  minKeywordOverlap: number;
  /** Minimum word length for keywords */
  minWordLength: number;
  /** Redis key prefix for indexed chunks */
  indexedKeyPrefix: string;
  /** AutoMem API URL for embeddings (if not using local) */
  automemUrl?: string;
}

const DEFAULT_CONFIG: ConversationIndexerConfig = {
  minChunkMessages: 3,
  maxChunkMessages: 20,
  gapMinutes: 30,
  minKeywordOverlap: 0.2,
  minWordLength: 3,
  indexedKeyPrefix: 'INDEXED:conversation:',
};

/**
 * A message in a conversation
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sender?: string;
}

/**
 * A conversation chunk ready for indexing
 */
export interface ConversationChunk {
  id: string;
  contactId: string;
  messages: ConversationMessage[];
  keywords: string[];
  startTime: number;
  endTime: number;
  summary?: string;
}

/**
 * Result of indexing a chunk
 */
export interface IndexingResult {
  chunkId: string;
  memoryId?: string;
  status: 'created' | 'already_indexed' | 'skipped' | 'error';
  error?: string;
}


/**
 * Conversation Indexer class
 * Handles chunking, embedding, and storage of conversation history
 */
export class ConversationIndexer {
  private config: ConversationIndexerConfig;

  constructor(config: Partial<ConversationIndexerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text: string): Set<string> {
    const normalized = text
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = normalized.split(' ');
    const keywords = new Set<string>();

    for (const word of words) {
      const cleanWord = word.replace(/'/g, '');
      if (cleanWord.length >= this.config.minWordLength && !DEFAULT_STOPWORDS.has(cleanWord)) {
        keywords.add(cleanWord);
      }
    }

    return keywords;
  }

  /**
   * Calculate keyword overlap ratio between two sets
   */
  calculateKeywordOverlap(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 || set2.size === 0) {
      return 0;
    }

    const intersection = [...set1].filter((x) => set2.has(x));
    return intersection.length / Math.min(set1.size, set2.size);
  }

  /**
   * Generate a unique chunk ID based on content
   * Used for deduplication
   */
  generateChunkId(contactId: string, messages: ConversationMessage[]): string {
    const content = messages.map((m) => `${m.timestamp}:${m.role}:${m.content}`).join('|');
    const hash = createHash('sha256').update(content).digest('hex').substring(0, 16);
    return `${contactId}:${hash}`;
  }

  /**
   * Check if a chunk has already been indexed
   */
  async isChunkIndexed(chunkId: string): Promise<boolean> {
    try {
      const key = `${this.config.indexedKeyPrefix}${chunkId}`;
      const exists = await redisClient.client.exists(key);
      return exists === 1;
    } catch (error) {
      console.warn(`[${SERVICE_NAME}] Error checking indexed status:`, error);
      return false;
    }
  }

  /**
   * Mark a chunk as indexed
   */
  async markChunkIndexed(chunkId: string, memoryId: string): Promise<void> {
    try {
      const key = `${this.config.indexedKeyPrefix}${chunkId}`;
      await redisClient.client.set(key, JSON.stringify({
        memoryId,
        indexedAt: Date.now(),
      }));
    } catch (error) {
      console.warn(`[${SERVICE_NAME}] Error marking chunk as indexed:`, error);
    }
  }

  /**
   * Chunk messages by topic and time continuity
   */
  chunkMessages(
    contactId: string,
    messages: ConversationMessage[]
  ): ConversationChunk[] {
    if (messages.length === 0) {
      return [];
    }

    // Sort by timestamp
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

    const chunks: ConversationChunk[] = [];
    let currentMessages: ConversationMessage[] = [];
    let currentKeywords = new Set<string>();

    const gapMs = this.config.gapMinutes * 60 * 1000;

    for (const msg of sorted) {
      const msgKeywords = this.extractKeywords(msg.content);
      const lastMsg = currentMessages[currentMessages.length - 1];
      const timeGap = lastMsg ? msg.timestamp - lastMsg.timestamp : 0;

      // Calculate keyword overlap
      const overlap = this.calculateKeywordOverlap(currentKeywords, msgKeywords);

      // Start new chunk if:
      // 1. Time gap exceeds threshold AND keyword overlap is low, OR
      // 2. Current chunk is at max size
      const shouldBreak =
        (currentMessages.length > 0 && timeGap > gapMs && overlap < this.config.minKeywordOverlap) ||
        currentMessages.length >= this.config.maxChunkMessages;

      if (shouldBreak && currentMessages.length >= this.config.minChunkMessages) {
        // Save current chunk
        const chunkId = this.generateChunkId(contactId, currentMessages);
        chunks.push({
          id: chunkId,
          contactId,
          messages: currentMessages,
          keywords: Array.from(currentKeywords),
          startTime: currentMessages[0]?.timestamp ?? 0,
          endTime: currentMessages[currentMessages.length - 1]?.timestamp ?? 0,
        });

        // Start new chunk
        currentMessages = [];
        currentKeywords = new Set();
      }

      // Add message to current chunk
      currentMessages.push(msg);
      msgKeywords.forEach((k) => currentKeywords.add(k));
    }

    // Don't forget the last chunk
    if (currentMessages.length >= this.config.minChunkMessages) {
      const chunkId = this.generateChunkId(contactId, currentMessages);
      chunks.push({
        id: chunkId,
        contactId,
        messages: currentMessages,
        keywords: Array.from(currentKeywords),
        startTime: currentMessages[0]?.timestamp ?? 0,
        endTime: currentMessages[currentMessages.length - 1]?.timestamp ?? 0,
      });
    }

    return chunks;
  }

  /**
   * Generate a summary text for a chunk (for embedding)
   */
  generateChunkSummary(chunk: ConversationChunk): string {
    // Build a summary that includes:
    // 1. Top keywords
    // 2. Date range
    // 3. Concatenated messages (truncated)

    const topKeywords = chunk.keywords.slice(0, 10).join(', ');
    const dateRange = `${new Date(chunk.startTime).toISOString().split('T')[0]} to ${new Date(chunk.endTime).toISOString().split('T')[0]}`;

    // Concatenate messages with role indicators
    const messageText = chunk.messages
      .map((m) => `${m.role === 'user' ? 'Contact' : 'Me'}: ${m.content}`)
      .join('\n')
      .slice(0, 2000); // Limit to 2000 chars

    return `Conversation about: ${topKeywords}\nDate: ${dateRange}\n\n${messageText}`;
  }

  /**
   * Index a single conversation chunk
   */
  async indexChunk(chunk: ConversationChunk): Promise<IndexingResult> {
    // Check for duplicates
    if (await this.isChunkIndexed(chunk.id)) {
      console.log(`[${SERVICE_NAME}] Chunk ${chunk.id} already indexed, skipping`);
      return { chunkId: chunk.id, status: 'already_indexed' };
    }

    // Check if AutoMem is connected
    if (!automemClient.connected) {
      console.warn(`[${SERVICE_NAME}] AutoMem not connected, skipping chunk ${chunk.id}`);
      return { chunkId: chunk.id, status: 'skipped', error: 'AutoMem not connected' };
    }

    try {
      // Generate summary for embedding
      const summary = this.generateChunkSummary(chunk);

      // Store in AutoMem
      // AutoMem will handle embedding generation internally
      const storeRequest: StoreMemoryRequest = {
        content: JSON.stringify({
          type: 'conversation_chunk',
          chunkId: chunk.id,
          contactId: chunk.contactId,
          messageCount: chunk.messages.length,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          keywords: chunk.keywords,
          summary,
        }),
        type: 'Context',
        tags: [
          `contact:${chunk.contactId}`,
          'entity:conversation_chunk',
          ...chunk.keywords.slice(0, 5).map((k) => `keyword:${k}`),
        ],
        importance: 0.5,
        metadata: {
          entityType: 'conversation_chunk',
          chunkId: chunk.id,
          contactId: chunk.contactId,
          messageCount: chunk.messages.length,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
        },
      };

      const response = await automemClient.store(storeRequest);

      // Mark as indexed
      await this.markChunkIndexed(chunk.id, response.id);

      console.log(`[${SERVICE_NAME}] Indexed chunk ${chunk.id} -> memory ${response.id}`);

      return {
        chunkId: chunk.id,
        memoryId: response.id,
        status: 'created',
      };
    } catch (error) {
      console.error(`[${SERVICE_NAME}] Error indexing chunk ${chunk.id}:`, error);
      return {
        chunkId: chunk.id,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Index all conversation chunks for a contact
   */
  async indexContactConversations(
    contactId: string,
    messages: ConversationMessage[]
  ): Promise<{
    chunksCreated: number;
    chunksSkipped: number;
    errors: string[];
  }> {
    console.log(`[${SERVICE_NAME}] Indexing conversations for ${contactId} (${messages.length} messages)...`);

    // Chunk the messages
    const chunks = this.chunkMessages(contactId, messages);
    console.log(`[${SERVICE_NAME}] Created ${chunks.length} chunks for ${contactId}`);

    let chunksCreated = 0;
    let chunksSkipped = 0;
    const errors: string[] = [];

    // Index each chunk
    for (const chunk of chunks) {
      const result = await this.indexChunk(chunk);

      switch (result.status) {
        case 'created':
          chunksCreated++;
          break;
        case 'already_indexed':
        case 'skipped':
          chunksSkipped++;
          break;
        case 'error':
          errors.push(result.error || 'Unknown error');
          break;
      }
    }

    console.log(
      `[${SERVICE_NAME}] Indexing complete for ${contactId}: ${chunksCreated} created, ${chunksSkipped} skipped, ${errors.length} errors`
    );

    return { chunksCreated, chunksSkipped, errors };
  }

  /**
   * Scan for keys matching a pattern (production-safe alternative to KEYS)
   * Uses SCAN command which iterates without blocking Redis
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    const stream = redisClient.client.scanStream({
      match: pattern,
      count: 100, // Batch size per SCAN iteration
    });

    return new Promise((resolve, reject) => {
      stream.on('data', (resultKeys: string[]) => {
        keys.push(...resultKeys);
      });
      stream.on('end', () => {
        resolve(keys);
      });
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get indexed chunks for a contact
   */
  async getIndexedChunks(contactId: string): Promise<string[]> {
    try {
      const pattern = `${this.config.indexedKeyPrefix}${contactId}:*`;
      const keys = await this.scanKeys(pattern);
      return keys.map((k) => k.replace(this.config.indexedKeyPrefix, ''));
    } catch (error) {
      console.warn(`[${SERVICE_NAME}] Error getting indexed chunks:`, error);
      return [];
    }
  }

  /**
   * Clear indexed status for a contact (for reindexing)
   */
  async clearIndexedStatus(contactId: string): Promise<number> {
    try {
      const pattern = `${this.config.indexedKeyPrefix}${contactId}:*`;
      const keys = await this.scanKeys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      // Delete in batches to avoid overwhelming Redis
      const BATCH_SIZE = 100;
      for (let i = 0; i < keys.length; i += BATCH_SIZE) {
        const batch = keys.slice(i, i + BATCH_SIZE);
        await redisClient.client.del(...batch);
      }

      console.log(`[${SERVICE_NAME}] Cleared ${keys.length} indexed chunks for ${contactId}`);
      return keys.length;
    } catch (error) {
      console.warn(`[${SERVICE_NAME}] Error clearing indexed status:`, error);
      return 0;
    }
  }
}

// Singleton instance
let indexerInstance: ConversationIndexer | null = null;

/**
 * Get the conversation indexer instance
 */
export function getConversationIndexer(config?: Partial<ConversationIndexerConfig>): ConversationIndexer {
  if (!indexerInstance) {
    indexerInstance = new ConversationIndexer(config);
  }
  return indexerInstance;
}
