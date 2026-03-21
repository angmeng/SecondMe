/**
 * Retrieval Fusion Tests
 * Tests for multi-source retrieval and fusion scoring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../../automem/recall.js', () => ({
  getContactContext: vi.fn().mockResolvedValue({
    people: [{ name: 'John' }],
    topics: [{ name: 'JavaScript', times: 5, lastMentioned: Date.now() }],
    events: [{ name: 'Meeting' }],
  }),
  searchRelevantContext: vi.fn().mockResolvedValue({
    results: [],
  }),
}));

vi.mock('../../automem/client.js', () => ({
  automemClient: {
    connected: true,
  },
}));

vi.mock('../../history/index.js', () => ({
  historyCache: {
    getRecentHistory: vi.fn().mockResolvedValue({
      messages: [],
      messageCount: 0,
    }),
  },
}));

vi.mock('../../history/keyword-chunker.js', () => ({
  extractKeywords: vi.fn().mockReturnValue(new Set(['javascript', 'coding'])),
}));

import { RetrievalFusion, type RetrievalFusionConfig } from '../fusion.js';
import { getContactContext, searchRelevantContext } from '../../automem/recall.js';
import { automemClient } from '../../automem/client.js';
import { historyCache } from '../../history/index.js';

describe('RetrievalFusion', () => {
  let fusion: RetrievalFusion;

  beforeEach(() => {
    vi.clearAllMocks();
    fusion = new RetrievalFusion({ enabled: true });
  });

  describe('isEnabled()', () => {
    it('should return false when fusion is disabled', () => {
      const disabled = new RetrievalFusion({ enabled: false });
      expect(disabled.isEnabled()).toBe(false);
    });

    it('should return false when AutoMem is not connected', () => {
      vi.mocked(automemClient).connected = false;

      const fusion = new RetrievalFusion({ enabled: true });
      expect(fusion.isEnabled()).toBe(false);

      // Restore
      vi.mocked(automemClient).connected = true;
    });

    it('should return true when enabled and AutoMem connected', () => {
      vi.mocked(automemClient).connected = true;

      const fusion = new RetrievalFusion({ enabled: true });
      expect(fusion.isEnabled()).toBe(true);
    });
  });

  describe('retrieve()', () => {
    it('should fallback to legacy when disabled', async () => {
      const disabled = new RetrievalFusion({ enabled: false });

      const result = await disabled.retrieve('test message', 'contact-1');

      expect(result.method).toBe('legacy');
      expect(getContactContext).toHaveBeenCalled();
    });

    it('should run fusion when enabled', async () => {
      vi.mocked(automemClient).connected = true;

      const result = await fusion.retrieve('test message about JavaScript', 'contact-1');

      expect(result.method).toBe('fusion');
      expect(result.stats.sourcesUsed.length).toBeGreaterThan(0);
    });

    it('should track latency', async () => {
      const result = await fusion.retrieve('test', 'contact-1');

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should include graph results in stats', async () => {
      vi.mocked(getContactContext).mockResolvedValue({
        people: [{ name: 'Alice' }, { name: 'Bob' }],
        topics: [{ name: 'React', times: 3, lastMentioned: Date.now() }],
        events: [],
      });

      const result = await fusion.retrieve('test', 'contact-1');

      expect(result.stats.graphResults).toBe(3); // 2 people + 1 topic
    });

    it('should include history message count', async () => {
      vi.mocked(historyCache.getRecentHistory).mockResolvedValue({
        messages: [
          { role: 'user', content: 'Hello', timestamp: 1000 },
          { role: 'assistant', content: 'Hi', timestamp: 2000 },
        ],
        messageCount: 2,
      });

      const result = await fusion.retrieve('test', 'contact-1');

      expect(result.historyMessageCount).toBe(2);
      expect(result.stats.historyMessages).toBe(2);
    });
  });

  describe('token budget', () => {
    it('should not trim when within budget', async () => {
      vi.mocked(getContactContext).mockResolvedValue({
        people: [{ name: 'Alice' }],
        topics: [{ name: 'React', times: 1, lastMentioned: Date.now() }],
        events: [],
      });

      const largebudget = new RetrievalFusion({
        enabled: true,
        tokenBudget: 10000,
      });

      const result = await largebudget.retrieve('test', 'contact-1');

      expect(result.context.people.length).toBe(1);
      expect(result.context.topics.length).toBe(1);
    });

    it('should trim results when exceeding budget', async () => {
      // Create many results that would exceed budget
      const manyPeople = Array.from({ length: 20 }, (_, i) => ({ name: `Person${i}` }));
      const manyTopics = Array.from({ length: 20 }, (_, i) => ({
        name: `Topic${i}`,
        times: 1,
        lastMentioned: Date.now(),
      }));

      vi.mocked(getContactContext).mockResolvedValue({
        people: manyPeople,
        topics: manyTopics,
        events: [],
      });

      const smallBudget = new RetrievalFusion({
        enabled: true,
        tokenBudget: 200, // Very small budget
        tokensPerEntity: {
          topic: 30,
          person: 50,
          event: 40,
          historyMessage: 20,
        },
      });

      const result = await smallBudget.retrieve('test', 'contact-1');

      // Should have fewer results than original
      expect(result.context.people.length).toBeLessThan(20);
      expect(result.context.topics.length).toBeLessThan(20);
      expect(result.stats.tokenEstimate).toBeLessThanOrEqual(200);
    });
  });

  describe('getConfig()', () => {
    it('should return current configuration', () => {
      const config = fusion.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.weights).toBeDefined();
      expect(config.weights.semantic).toBeDefined();
    });
  });

  describe('updateWeights()', () => {
    it('should update weights', () => {
      fusion.updateWeights({ semantic: 0.5, keyword: 0.5 });

      const config = fusion.getConfig();

      expect(config.weights.semantic).toBe(0.5);
      expect(config.weights.keyword).toBe(0.5);
      // Other weights should remain unchanged
      expect(config.weights.graph).toBeDefined();
    });
  });

  describe('scoring and ranking', () => {
    it('should score results from multiple sources higher', async () => {
      // Mock semantic results
      vi.mocked(searchRelevantContext).mockResolvedValue({
        results: [
          {
            memory: {
              content: JSON.stringify({ name: 'JavaScript', mentionCount: 5, lastMentioned: Date.now() }),
              metadata: { entityType: 'topic' },
            },
          },
        ],
      });

      // Mock graph results with same topic
      vi.mocked(getContactContext).mockResolvedValue({
        people: [],
        topics: [{ name: 'JavaScript', times: 5, lastMentioned: Date.now() }],
        events: [],
      });

      const result = await fusion.retrieve('tell me about JavaScript', 'contact-1');

      // JavaScript should appear (from both sources, higher score)
      const hasJavaScript = result.context.topics.some(t =>
        t.name.toLowerCase() === 'javascript'
      );
      expect(hasJavaScript).toBe(true);
    });

    it('should filter results below minimum score', async () => {
      const highMinScore = new RetrievalFusion({
        enabled: true,
        minScore: 0.9, // Very high threshold
        weights: {
          semantic: 0.1,
          keyword: 0.1,
          graph: 0.1,
          history: 0.1,
        },
      });

      vi.mocked(getContactContext).mockResolvedValue({
        people: [{ name: 'LowScorePerson' }],
        topics: [],
        events: [],
      });

      const result = await highMinScore.retrieve('test', 'contact-1');

      // With weights of 0.1 each, max score is 0.4 (if all sources return same item)
      // Since minScore is 0.9, no results should pass
      expect(result.context.people.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle semantic retrieval errors gracefully', async () => {
      vi.mocked(searchRelevantContext).mockRejectedValue(new Error('API error'));

      const result = await fusion.retrieve('test', 'contact-1');

      // Should still return results from other sources
      expect(result.method).toBe('fusion');
      expect(result.stats.semanticResults).toBe(0);
    });

    it('should handle graph retrieval errors gracefully', async () => {
      vi.mocked(getContactContext).mockRejectedValue(new Error('Graph error'));

      const result = await fusion.retrieve('test', 'contact-1');

      expect(result.method).toBe('fusion');
      expect(result.stats.graphResults).toBe(0);
    });
  });
});

describe('getRetrievalFusion()', () => {
  it('should return singleton instance', async () => {
    const { getRetrievalFusion } = await import('../fusion.js');

    const instance1 = getRetrievalFusion();
    const instance2 = getRetrievalFusion();

    expect(instance1).toBe(instance2);
  });
});

describe('isFusionEnabled()', () => {
  it('should reflect fusion state', async () => {
    vi.mocked(automemClient).connected = true;

    const { isFusionEnabled, getRetrievalFusion } = await import('../fusion.js');

    // Get instance with enabled: true
    const fusion = getRetrievalFusion({ enabled: true });

    expect(isFusionEnabled()).toBe(fusion.isEnabled());
  });
});
