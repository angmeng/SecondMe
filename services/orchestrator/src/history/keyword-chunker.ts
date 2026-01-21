/**
 * Keyword-Based Conversation Chunker
 * Groups messages into semantic chunks based on keyword continuity and time gaps
 *
 * Level 2 implementation: Time-gap + Keyword continuity
 */

import { historyConfig, estimateTokens } from '../config/history-config.js';

/**
 * Stored message from Redis
 */
export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  type?: 'incoming' | 'outgoing' | 'fromMe';
}

/**
 * A chunk of related messages (same topic/conversation thread)
 */
export interface ConversationChunk {
  messages: StoredMessage[];
  keywords: Set<string>;
  startTime: number;
  endTime: number;
  tokenCount: number;
}

/**
 * Common English stopwords to filter out
 */
const STOPWORDS = new Set([
  // Articles & determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  // Pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'ours', 'theirs',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',
  // Prepositions
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about',
  'into', 'over', 'after', 'under', 'between', 'out', 'against', 'during',
  // Conjunctions
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  // Auxiliary verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  // Common verbs
  'get', 'got', 'getting', 'make', 'made', 'making', 'go', 'going', 'went', 'gone',
  'come', 'came', 'coming', 'take', 'took', 'taken', 'taking',
  'know', 'knew', 'known', 'knowing', 'think', 'thought', 'thinking',
  'see', 'saw', 'seen', 'seeing', 'want', 'wanted', 'wanting',
  'use', 'used', 'using', 'find', 'found', 'finding',
  'give', 'gave', 'given', 'giving', 'tell', 'told', 'telling',
  'say', 'said', 'saying', 'look', 'looked', 'looking',
  // Common adverbs
  'just', 'also', 'now', 'then', 'here', 'there', 'when', 'where', 'why', 'how',
  'very', 'really', 'actually', 'probably', 'maybe', 'always', 'never', 'often',
  'still', 'already', 'ever', 'even', 'only', 'again', 'back',
  // Common adjectives
  'good', 'great', 'nice', 'bad', 'new', 'old', 'big', 'small', 'same', 'different',
  'other', 'more', 'most', 'some', 'any', 'all', 'many', 'much', 'few', 'little',
  'first', 'last', 'next', 'own', 'right', 'sure',
  // Question words
  'what', 'which', 'who', 'whom', 'whose',
  // Common chat words
  'yeah', 'yes', 'yep', 'yup', 'no', 'nope', 'nah', 'okay', 'ok', 'sure', 'thanks',
  'thank', 'please', 'sorry', 'well', 'like', 'just', 'thing', 'things', 'stuff',
  'hey', 'hello', 'hi', 'bye', 'lol', 'haha', 'hehe', 'wow', 'cool', 'nice',
  // Time-related
  'today', 'tomorrow', 'yesterday', 'time', 'day', 'week', 'month', 'year',
  // Misc
  'let', 'lets', 'dont', 'didnt', 'doesnt', 'wont', 'cant', 'couldnt', 'wouldnt',
  'shouldnt', 'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'hadnt',
  'being', 'been', 'something', 'anything', 'nothing', 'everything',
  'someone', 'anyone', 'everyone', 'nobody',
]);

/**
 * Extract keywords from text
 * Filters out stopwords and short words
 */
export function extractKeywords(text: string): Set<string> {
  const { minWordLength } = historyConfig.chunking;

  // Normalize: lowercase, remove punctuation except apostrophes
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.split(' ');
  const keywords = new Set<string>();

  for (const word of words) {
    // Remove apostrophe-based contractions
    const cleanWord = word.replace(/'/g, '');

    // Skip short words and stopwords
    if (cleanWord.length >= minWordLength && !STOPWORDS.has(cleanWord)) {
      keywords.add(cleanWord);
    }
  }

  return keywords;
}

/**
 * Calculate keyword overlap ratio between two sets
 * Returns 0-1 where 1 = complete overlap
 */
export function calculateKeywordOverlap(
  set1: Set<string>,
  set2: Set<string>
): number {
  if (set1.size === 0 || set2.size === 0) {
    return 0;
  }

  const intersection = [...set1].filter((x) => set2.has(x));
  // Use minimum set size for overlap calculation (Jaccard-like)
  return intersection.length / Math.min(set1.size, set2.size);
}

/**
 * Build a conversation chunk from messages
 */
function buildChunk(messages: StoredMessage[], keywords: Set<string>): ConversationChunk {
  const tokenCount = messages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content) + 10, // +10 for role/formatting overhead
    0
  );

  return {
    messages,
    keywords,
    startTime: messages[0]?.timestamp ?? 0,
    endTime: messages[messages.length - 1]?.timestamp ?? 0,
    tokenCount,
  };
}

/**
 * Chunk messages by keyword continuity
 * Groups messages that share keywords, respecting time gaps
 *
 * @param messages - Messages sorted by timestamp (oldest first)
 * @returns Array of conversation chunks
 */
export function chunkByKeywordContinuity(
  messages: StoredMessage[]
): ConversationChunk[] {
  if (messages.length === 0) {
    return [];
  }

  const { gapMinutes, minKeywordOverlap } = historyConfig.chunking;
  const gapMs = gapMinutes * 60 * 1000;

  const chunks: ConversationChunk[] = [];
  let currentChunkMessages: StoredMessage[] = [];
  let currentChunkKeywords = new Set<string>();

  for (const msg of messages) {
    const msgKeywords = extractKeywords(msg.content);
    const lastMsg = currentChunkMessages[currentChunkMessages.length - 1];
    const timeGap = lastMsg ? msg.timestamp - lastMsg.timestamp : 0;

    // Calculate keyword overlap with current chunk
    const overlap = calculateKeywordOverlap(currentChunkKeywords, msgKeywords);

    // Start new chunk if:
    // 1. Time gap exceeds threshold AND
    // 2. Keyword overlap is below minimum
    // (Both conditions must be met to break the chunk)
    const shouldBreak =
      currentChunkMessages.length > 0 &&
      timeGap > gapMs &&
      overlap < minKeywordOverlap;

    if (shouldBreak) {
      // Save current chunk
      chunks.push(buildChunk(currentChunkMessages, currentChunkKeywords));

      // Start new chunk
      currentChunkMessages = [];
      currentChunkKeywords = new Set();
    }

    // Add message to current chunk
    currentChunkMessages.push(msg);

    // Add message keywords to chunk keywords
    msgKeywords.forEach((k) => currentChunkKeywords.add(k));
  }

  // Don't forget the last chunk
  if (currentChunkMessages.length > 0) {
    chunks.push(buildChunk(currentChunkMessages, currentChunkKeywords));
  }

  return chunks;
}

/**
 * Select messages from chunks to fill token budget
 * Prioritizes most recent chunks while respecting min/max message counts
 *
 * @param chunks - Conversation chunks (oldest first)
 * @param config - Retrieval configuration
 * @returns Selected messages (oldest first, for chronological order)
 */
export function selectMessagesFromChunks(
  chunks: ConversationChunk[],
  config: {
    maxTokens: number;
    minMessages: number;
    maxMessages: number;
  }
): StoredMessage[] {
  if (chunks.length === 0) {
    return [];
  }

  const { maxTokens, minMessages, maxMessages } = config;
  const selectedMessages: StoredMessage[] = [];
  let tokenCount = 0;

  // Process chunks from most recent to oldest
  const reversedChunks = [...chunks].reverse();

  for (const chunk of reversedChunks) {
    // Check if we can fit this entire chunk
    if (tokenCount + chunk.tokenCount <= maxTokens) {
      // Add all messages from chunk (prepend to maintain order)
      selectedMessages.unshift(...chunk.messages);
      tokenCount += chunk.tokenCount;
    } else if (selectedMessages.length < minMessages) {
      // Need more messages to meet minimum - add partial chunk
      for (const msg of [...chunk.messages].reverse()) {
        const msgTokens = estimateTokens(msg.content) + 10;

        if (tokenCount + msgTokens > maxTokens && selectedMessages.length >= minMessages) {
          break;
        }

        selectedMessages.unshift(msg);
        tokenCount += msgTokens;

        if (selectedMessages.length >= maxMessages) {
          break;
        }
      }
    }

    // Stop if we've reached max messages
    if (selectedMessages.length >= maxMessages) {
      break;
    }
  }

  return selectedMessages;
}

/**
 * Truncate message content to max length
 */
export function truncateMessage(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength - 15) + '... [truncated]';
}

/**
 * Main entry point: Process messages with keyword chunking
 * Takes raw messages and returns selected messages for context
 *
 * @param messages - Raw messages from Redis (newest first from ZREVRANGE)
 * @param maxAgeMs - Maximum age of messages to include (milliseconds)
 * @returns Messages ready for Claude API (oldest first, truncated)
 */
export function processMessagesWithChunking(
  messages: StoredMessage[],
  maxAgeMs: number
): StoredMessage[] {
  const { retrieval } = historyConfig;
  const cutoffTime = Date.now() - maxAgeMs;

  // 1. Filter by age and reverse to chronological order (oldest first)
  const recentMessages = messages
    .filter((m) => m.timestamp > cutoffTime)
    .reverse();

  if (recentMessages.length === 0) {
    return [];
  }

  // 2. Chunk by keyword continuity
  const chunks = chunkByKeywordContinuity(recentMessages);

  // 3. Select messages to fill token budget
  const selectedMessages = selectMessagesFromChunks(chunks, {
    maxTokens: retrieval.maxTokens,
    minMessages: retrieval.minMessages,
    maxMessages: retrieval.maxMessages,
  });

  // 4. Truncate long messages
  return selectedMessages.map((msg) => ({
    ...msg,
    content: truncateMessage(msg.content, retrieval.maxMessageLength),
  }));
}

export default {
  extractKeywords,
  calculateKeywordOverlap,
  chunkByKeywordContinuity,
  selectMessagesFromChunks,
  processMessagesWithChunking,
  truncateMessage,
};
