/**
 * Conversation Indexer Tests
 * Tests for conversation chunking, keyword extraction, and indexing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConversationIndexer,
  type ConversationMessage,
  type ConversationIndexerConfig,
} from '../conversation-indexer.js';

// Mock Redis client
vi.mock('../../redis/client.js', () => ({
  redisClient: {
    client: {
      get: vi.fn(),
      set: vi.fn(),
      exists: vi.fn(),
      del: vi.fn(),
      scanStream: vi.fn(() => {
        const stream = {
          on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
            if (event === 'end') {
              setTimeout(() => callback(), 0);
            }
            return stream;
          }),
        };
        return stream;
      }),
    },
  },
}));

// Mock AutoMem client
vi.mock('../../automem/client.js', () => ({
  automemClient: {
    connected: true,
    store: vi.fn().mockResolvedValue({ id: 'mem-123' }),
  },
}));

import { redisClient } from '../../redis/client.js';
import { automemClient } from '../../automem/client.js';

describe('ConversationIndexer', () => {
  let indexer: ConversationIndexer;

  beforeEach(() => {
    vi.clearAllMocks();
    indexer = new ConversationIndexer();
  });

  describe('extractKeywords()', () => {
    it('should extract meaningful keywords', () => {
      const text = 'I went to the coffee shop yesterday with John';
      const keywords = indexer.extractKeywords(text);

      expect(keywords.has('coffee')).toBe(true);
      expect(keywords.has('shop')).toBe(true);
      expect(keywords.has('john')).toBe(true);
    });

    it('should filter out stopwords', () => {
      const text = 'I went to the store and bought some things';
      const keywords = indexer.extractKeywords(text);

      expect(keywords.has('the')).toBe(false);
      expect(keywords.has('and')).toBe(false);
      expect(keywords.has('some')).toBe(false);
      expect(keywords.has('store')).toBe(true);
      expect(keywords.has('bought')).toBe(true);
    });

    it('should filter out short words', () => {
      const text = 'I am at the IT hub';
      const keywords = indexer.extractKeywords(text);

      expect(keywords.has('am')).toBe(false);
      expect(keywords.has('at')).toBe(false);
      expect(keywords.has('it')).toBe(false);
      expect(keywords.has('hub')).toBe(true);
    });

    it('should handle empty text', () => {
      const keywords = indexer.extractKeywords('');
      expect(keywords.size).toBe(0);
    });

    it('should normalize case', () => {
      const text = 'JavaScript and PYTHON are Programming languages';
      const keywords = indexer.extractKeywords(text);

      expect(keywords.has('javascript')).toBe(true);
      expect(keywords.has('python')).toBe(true);
      expect(keywords.has('programming')).toBe(true);
      expect(keywords.has('languages')).toBe(true);
    });
  });

  describe('calculateKeywordOverlap()', () => {
    it('should return 1 for identical sets', () => {
      const set1 = new Set(['apple', 'banana', 'cherry']);
      const set2 = new Set(['apple', 'banana', 'cherry']);

      const overlap = indexer.calculateKeywordOverlap(set1, set2);

      expect(overlap).toBe(1);
    });

    it('should return 0 for disjoint sets', () => {
      const set1 = new Set(['apple', 'banana']);
      const set2 = new Set(['cherry', 'date']);

      const overlap = indexer.calculateKeywordOverlap(set1, set2);

      expect(overlap).toBe(0);
    });

    it('should calculate partial overlap', () => {
      const set1 = new Set(['apple', 'banana', 'cherry']);
      const set2 = new Set(['banana', 'cherry', 'date']);

      const overlap = indexer.calculateKeywordOverlap(set1, set2);

      // 2 common elements, min size is 3
      expect(overlap).toBeCloseTo(2 / 3);
    });

    it('should return 0 for empty sets', () => {
      const empty = new Set<string>();
      const nonEmpty = new Set(['apple']);

      expect(indexer.calculateKeywordOverlap(empty, nonEmpty)).toBe(0);
      expect(indexer.calculateKeywordOverlap(nonEmpty, empty)).toBe(0);
      expect(indexer.calculateKeywordOverlap(empty, empty)).toBe(0);
    });
  });

  describe('generateChunkId()', () => {
    it('should generate consistent IDs for same content', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: 1000 },
        { id: '2', role: 'assistant', content: 'Hi', timestamp: 2000 },
      ];

      const id1 = indexer.generateChunkId('contact-1', messages);
      const id2 = indexer.generateChunkId('contact-1', messages);

      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different content', () => {
      const messages1: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: 1000 },
      ];
      const messages2: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Goodbye', timestamp: 1000 },
      ];

      const id1 = indexer.generateChunkId('contact-1', messages1);
      const id2 = indexer.generateChunkId('contact-1', messages2);

      expect(id1).not.toBe(id2);
    });

    it('should include contact ID in chunk ID', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: 1000 },
      ];

      const id = indexer.generateChunkId('contact-123', messages);

      expect(id.startsWith('contact-123:')).toBe(true);
    });
  });

  describe('chunkMessages()', () => {
    it('should return empty array for empty messages', () => {
      const chunks = indexer.chunkMessages('contact-1', []);
      expect(chunks).toHaveLength(0);
    });

    it('should skip chunks below minimum message threshold', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: 1000 },
        { id: '2', role: 'assistant', content: 'Hi', timestamp: 2000 },
      ];

      // Default minChunkMessages is 3
      const chunks = indexer.chunkMessages('contact-1', messages);

      expect(chunks).toHaveLength(0);
    });

    it('should create chunks when messages exceed minimum', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: 1000 },
        { id: '2', role: 'assistant', content: 'Hi there', timestamp: 2000 },
        { id: '3', role: 'user', content: 'How are you', timestamp: 3000 },
      ];

      const chunks = indexer.chunkMessages('contact-1', messages);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].messages).toHaveLength(3);
    });

    it('should split chunks by time gap and low keyword overlap', () => {
      const gapMs = 30 * 60 * 1000; // 30 minutes in ms

      // Use completely distinct keywords between the two groups
      // Chunk splitting requires BOTH time gap AND low keyword overlap
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'espresso cappuccino latte', timestamp: 1000 },
        { id: '2', role: 'assistant', content: 'barista roasting beans', timestamp: 2000 },
        { id: '3', role: 'user', content: 'brewing arabica robusta', timestamp: 3000 },
        // Gap of 30+ minutes with completely different keywords
        { id: '4', role: 'user', content: 'kubernetes docker containers', timestamp: 3000 + gapMs + 1000 },
        { id: '5', role: 'assistant', content: 'orchestration microservices deployment', timestamp: 3000 + gapMs + 2000 },
        { id: '6', role: 'user', content: 'cluster nodes pods', timestamp: 3000 + gapMs + 3000 },
      ];

      const chunks = indexer.chunkMessages('contact-1', messages);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].messages).toHaveLength(3);
      expect(chunks[1].messages).toHaveLength(3);
    });

    it('should respect max chunk size', () => {
      const smallMaxIndexer = new ConversationIndexer({ maxChunkMessages: 4, minChunkMessages: 2 });

      const messages: ConversationMessage[] = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant' as const,
        content: `Message ${i} about topic`,
        timestamp: i * 1000,
      }));

      const chunks = smallMaxIndexer.chunkMessages('contact-1', messages);

      // Should split into multiple chunks
      expect(chunks.length).toBeGreaterThan(1);
      // No chunk should exceed max size
      chunks.forEach(chunk => {
        expect(chunk.messages.length).toBeLessThanOrEqual(4);
      });
    });

    it('should extract keywords for chunks', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Let us discuss JavaScript', timestamp: 1000 },
        { id: '2', role: 'assistant', content: 'JavaScript is versatile', timestamp: 2000 },
        { id: '3', role: 'user', content: 'React uses JavaScript', timestamp: 3000 },
      ];

      const chunks = indexer.chunkMessages('contact-1', messages);

      expect(chunks[0].keywords).toContain('javascript');
      expect(chunks[0].keywords).toContain('react');
    });

    it('should set correct time boundaries', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'First message here', timestamp: 1000 },
        { id: '2', role: 'assistant', content: 'Second message here', timestamp: 2000 },
        { id: '3', role: 'user', content: 'Third message here', timestamp: 5000 },
      ];

      const chunks = indexer.chunkMessages('contact-1', messages);

      expect(chunks[0].startTime).toBe(1000);
      expect(chunks[0].endTime).toBe(5000);
    });
  });

  describe('generateChunkSummary()', () => {
    it('should include keywords in summary', () => {
      const chunk = {
        id: 'test-chunk',
        contactId: 'contact-1',
        messages: [
          { id: '1', role: 'user' as const, content: 'Hello world', timestamp: 1000 },
        ],
        keywords: ['javascript', 'react', 'programming'],
        startTime: 1000,
        endTime: 2000,
      };

      const summary = indexer.generateChunkSummary(chunk);

      expect(summary).toContain('javascript');
      expect(summary).toContain('react');
    });

    it('should include message content', () => {
      const chunk = {
        id: 'test-chunk',
        contactId: 'contact-1',
        messages: [
          { id: '1', role: 'user' as const, content: 'Hello world', timestamp: 1000 },
          { id: '2', role: 'assistant' as const, content: 'Hi there', timestamp: 2000 },
        ],
        keywords: ['test'],
        startTime: 1000,
        endTime: 2000,
      };

      const summary = indexer.generateChunkSummary(chunk);

      expect(summary).toContain('Hello world');
      expect(summary).toContain('Hi there');
    });
  });

  describe('indexChunk()', () => {
    it('should skip already indexed chunks', async () => {
      vi.mocked(redisClient.client.exists).mockResolvedValue(1);

      const chunk = {
        id: 'test-chunk',
        contactId: 'contact-1',
        messages: [{ id: '1', role: 'user' as const, content: 'Test', timestamp: 1000 }],
        keywords: ['test'],
        startTime: 1000,
        endTime: 2000,
      };

      const result = await indexer.indexChunk(chunk);

      expect(result.status).toBe('already_indexed');
      expect(automemClient.store).not.toHaveBeenCalled();
    });

    it('should skip when AutoMem is not connected', async () => {
      vi.mocked(redisClient.client.exists).mockResolvedValue(0);
      vi.mocked(automemClient).connected = false;

      const chunk = {
        id: 'test-chunk',
        contactId: 'contact-1',
        messages: [{ id: '1', role: 'user' as const, content: 'Test', timestamp: 1000 }],
        keywords: ['test'],
        startTime: 1000,
        endTime: 2000,
      };

      const result = await indexer.indexChunk(chunk);

      expect(result.status).toBe('skipped');
      expect(result.error).toContain('AutoMem not connected');

      // Restore
      vi.mocked(automemClient).connected = true;
    });

    it('should index chunk and mark as indexed', async () => {
      vi.mocked(redisClient.client.exists).mockResolvedValue(0);
      vi.mocked(redisClient.client.set).mockResolvedValue('OK');

      const chunk = {
        id: 'test-chunk',
        contactId: 'contact-1',
        messages: [{ id: '1', role: 'user' as const, content: 'Test', timestamp: 1000 }],
        keywords: ['test'],
        startTime: 1000,
        endTime: 2000,
      };

      const result = await indexer.indexChunk(chunk);

      expect(result.status).toBe('created');
      expect(result.memoryId).toBe('mem-123');
      expect(automemClient.store).toHaveBeenCalled();
      expect(redisClient.client.set).toHaveBeenCalled();
    });

    it('should handle indexing errors', async () => {
      vi.mocked(redisClient.client.exists).mockResolvedValue(0);
      vi.mocked(automemClient.store).mockRejectedValueOnce(new Error('Store failed'));

      const chunk = {
        id: 'test-chunk',
        contactId: 'contact-1',
        messages: [{ id: '1', role: 'user' as const, content: 'Test', timestamp: 1000 }],
        keywords: ['test'],
        startTime: 1000,
        endTime: 2000,
      };

      const result = await indexer.indexChunk(chunk);

      expect(result.status).toBe('error');
      expect(result.error).toBe('Store failed');
    });
  });
});
