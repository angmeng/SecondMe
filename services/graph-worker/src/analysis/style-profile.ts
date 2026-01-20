/**
 * Style Profile Types and Analysis Helpers
 * Analyzes user's outgoing messages to build per-contact style profiles
 */

/**
 * Punctuation style characteristics
 */
export interface PunctuationStyle {
  usesEllipsis: boolean;
  exclamationFrequency: number; // Per message average
  questionFrequency: number; // Per message average
  endsWithPeriod: boolean;
}

/**
 * Per-contact communication style profile
 */
export interface StyleProfile {
  contactId: string;
  avgMessageLength: number;
  emojiFrequency: number; // Emojis per message
  formalityScore: number; // 0-1 scale (0 = casual, 1 = formal)
  punctuationStyle: PunctuationStyle;
  greetingStyle: string[]; // Common greetings used
  signOffStyle: string[]; // Common sign-offs
  sampleCount: number; // Messages analyzed
  lastUpdated: number; // Timestamp
}

/**
 * Accumulated style data in Redis (before FalkorDB update)
 */
export interface AccumulatedStyleData {
  messageLengths: number[];
  emojiCounts: number[];
  formalityScores: number[];
  punctuationData: {
    ellipsisCount: number;
    exclamationCount: number;
    questionCount: number;
    periodEndCount: number;
  };
  greetings: Map<string, number>; // greeting -> count
  signOffs: Map<string, number>; // signOff -> count
  sampleCount: number;
  lastUpdated: number;
}

// Configuration
export const STYLE_CONFIG = {
  minMessagesForProfile: 10, // Minimum samples before creating profile
  updateThreshold: 5, // New messages before updating FalkorDB
  redisTTL: 86400 * 7, // 7 days for accumulation data
  maxStoredSamples: 100, // Max samples to keep in Redis

  // Formality markers (positive = formal, negative = casual)
  formalityMarkers: {
    formal: ['please', 'would you', 'could you', 'thank you', 'regards', 'sincerely', 'appreciate'],
    casual: ['hey', 'yo', 'gonna', 'wanna', 'lol', 'haha', 'omg', 'yeah', 'nah', 'btw', 'tbh'],
  },

  // Common greeting patterns (case-insensitive, match at start)
  greetingPatterns: [
    /^(hey|hi|hello|good morning|good afternoon|good evening|yo|sup|hiya|howdy)/i,
  ],

  // Common sign-off patterns (case-insensitive, match at end)
  signOffPatterns: [
    /(thanks|thank you|cheers|regards|best|talk soon|later|bye|see you|ttyl|take care|xo|xx)[\s!.]*$/i,
  ],
};

// Emoji regex pattern (covers most common emojis)
const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]/gu;

/**
 * Calculate emoji frequency in text
 * @returns Number of emojis in the text
 */
export function calculateEmojiCount(text: string): number {
  const matches = text.match(EMOJI_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Calculate formality score for text
 * @returns Score from 0 (casual) to 1 (formal)
 */
export function calculateFormalityScore(text: string): number {
  const lowerText = text.toLowerCase();
  let score = 0.5; // Start neutral

  // Check for formal markers
  for (const marker of STYLE_CONFIG.formalityMarkers.formal) {
    if (lowerText.includes(marker)) {
      score += 0.1;
    }
  }

  // Check for casual markers
  for (const marker of STYLE_CONFIG.formalityMarkers.casual) {
    if (lowerText.includes(marker)) {
      score -= 0.1;
    }
  }

  // Check for contractions (casual indicator)
  const contractions = (text.match(/\b\w+'\w+\b/g) || []).length;
  if (contractions > 0) {
    score -= 0.05 * Math.min(contractions, 3);
  }

  // Check for proper capitalization at sentence starts (formal indicator)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const properlyCapitalized = sentences.filter((s) => /^\s*[A-Z]/.test(s)).length;
  if (sentences.length > 0 && properlyCapitalized / sentences.length > 0.8) {
    score += 0.1;
  }

  // Check for all lowercase (casual indicator)
  if (text === text.toLowerCase() && text.length > 10) {
    score -= 0.15;
  }

  // Clamp to 0-1
  return Math.max(0, Math.min(1, score));
}

/**
 * Extract greeting from message start
 * @returns Detected greeting or null
 */
export function extractGreeting(text: string): string | null {
  const trimmed = text.trim();

  for (const pattern of STYLE_CONFIG.greetingPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return match[0].toLowerCase();
    }
  }

  return null;
}

/**
 * Extract sign-off from message end
 * @returns Detected sign-off or null
 */
export function extractSignOff(text: string): string | null {
  const trimmed = text.trim();

  for (const pattern of STYLE_CONFIG.signOffPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      // Clean up the match (remove trailing punctuation/whitespace)
      return match[1].toLowerCase().trim();
    }
  }

  return null;
}

/**
 * Analyze punctuation style in text
 */
export function analyzePunctuation(text: string): {
  hasEllipsis: boolean;
  exclamationCount: number;
  questionCount: number;
  endsWithPeriod: boolean;
} {
  return {
    hasEllipsis: text.includes('...') || text.includes('…'),
    exclamationCount: (text.match(/!/g) || []).length,
    questionCount: (text.match(/\?/g) || []).length,
    endsWithPeriod: /\.\s*$/.test(text),
  };
}

/**
 * Create empty accumulated data for a new contact
 */
export function createEmptyAccumulatedData(): AccumulatedStyleData {
  return {
    messageLengths: [],
    emojiCounts: [],
    formalityScores: [],
    punctuationData: {
      ellipsisCount: 0,
      exclamationCount: 0,
      questionCount: 0,
      periodEndCount: 0,
    },
    greetings: new Map(),
    signOffs: new Map(),
    sampleCount: 0,
    lastUpdated: Date.now(),
  };
}

/**
 * Compute StyleProfile from accumulated data
 */
export function computeStyleProfile(
  contactId: string,
  data: AccumulatedStyleData
): StyleProfile {
  const sampleCount = data.sampleCount;

  // Calculate averages
  const avgMessageLength =
    data.messageLengths.length > 0
      ? data.messageLengths.reduce((a, b) => a + b, 0) / data.messageLengths.length
      : 0;

  const emojiFrequency =
    data.emojiCounts.length > 0
      ? data.emojiCounts.reduce((a, b) => a + b, 0) / data.emojiCounts.length
      : 0;

  const formalityScore =
    data.formalityScores.length > 0
      ? data.formalityScores.reduce((a, b) => a + b, 0) / data.formalityScores.length
      : 0.5;

  // Punctuation style
  const punctuationStyle: PunctuationStyle = {
    usesEllipsis: sampleCount > 0 && data.punctuationData.ellipsisCount / sampleCount > 0.2,
    exclamationFrequency: sampleCount > 0 ? data.punctuationData.exclamationCount / sampleCount : 0,
    questionFrequency: sampleCount > 0 ? data.punctuationData.questionCount / sampleCount : 0,
    endsWithPeriod: sampleCount > 0 && data.punctuationData.periodEndCount / sampleCount > 0.5,
  };

  // Top greetings
  const greetingStyle = Array.from(data.greetings.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([greeting]) => greeting);

  // Top sign-offs
  const signOffStyle = Array.from(data.signOffs.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([signOff]) => signOff);

  return {
    contactId,
    avgMessageLength,
    emojiFrequency,
    formalityScore,
    punctuationStyle,
    greetingStyle,
    signOffStyle,
    sampleCount,
    lastUpdated: data.lastUpdated,
  };
}

/**
 * Serialize accumulated data for Redis storage
 */
export function serializeAccumulatedData(data: AccumulatedStyleData): string {
  return JSON.stringify({
    ...data,
    greetings: Array.from(data.greetings.entries()),
    signOffs: Array.from(data.signOffs.entries()),
  });
}

/**
 * Deserialize accumulated data from Redis
 */
export function deserializeAccumulatedData(json: string): AccumulatedStyleData {
  const parsed = JSON.parse(json);
  return {
    ...parsed,
    greetings: new Map(parsed.greetings || []),
    signOffs: new Map(parsed.signOffs || []),
  };
}
