/**
 * Human Typing Simulation (HTS) - Delay Calculator
 * T088: Calculates realistic typing delays to simulate human-like response times
 *
 * Based on research on average human typing speeds:
 * - Average typing speed: 40-60 WPM (words per minute)
 * - Average word length: 5 characters
 * - Therefore: 200-300 characters per minute = 3.3-5 chars/second
 * - That's roughly 200-300ms per character for typing
 *
 * We also add:
 * - "Think time" before starting to type (reading the message)
 * - Cognitive pause between consecutive messages
 * - Random jitter to avoid robotic patterns
 */

export interface TypingDelayOptions {
  /** Words per minute speed (default: 50 WPM) */
  wpm?: number;
  /** Minimum think time in ms before typing starts (default: 1000ms) */
  minThinkTime?: number;
  /** Maximum think time in ms before typing starts (default: 3000ms) */
  maxThinkTime?: number;
  /** Whether to add random jitter (default: true) */
  addJitter?: boolean;
  /** Jitter range as percentage of total delay (default: 0.15 = 15%) */
  jitterFactor?: number;
}

export interface TypingDelayResult {
  /** Total delay in milliseconds before sending the message */
  totalDelayMs: number;
  /** Think time portion (reading/processing the message) */
  thinkTimeMs: number;
  /** Typing time portion (simulated keystrokes) */
  typingTimeMs: number;
  /** Jitter added */
  jitterMs: number;
}

const DEFAULT_OPTIONS: Required<TypingDelayOptions> = {
  wpm: 50,
  minThinkTime: 1000,
  maxThinkTime: 3000,
  addJitter: true,
  jitterFactor: 0.15,
};

/**
 * Calculate realistic typing delay for a given response text
 *
 * Formula:
 * 1. Think time: Random between minThinkTime and maxThinkTime
 * 2. Typing time: (chars / (wpm * 5 / 60)) * 1000 = chars * 12000 / wpm
 * 3. Jitter: Random ±jitterFactor of total
 *
 * Example for 50-word message (250 chars) at 50 WPM:
 * - Think time: ~2000ms
 * - Typing time: 250 * 12000 / 50 = 60000ms = 60 seconds (but we cap this)
 *
 * We cap the total delay to reasonable bounds to avoid excessive waits
 */
export function calculateTypingDelay(
  responseText: string,
  options: TypingDelayOptions = {}
): TypingDelayResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Calculate think time (time spent "reading" the incoming message)
  const thinkTimeMs = randomInRange(opts.minThinkTime, opts.maxThinkTime);

  // Calculate typing time based on character count and WPM
  // Formula: chars * (60000 / (wpm * avgWordLength))
  // With avgWordLength = 5: chars * 12000 / wpm
  const charCount = responseText.length;
  const msPerChar = 12000 / opts.wpm; // ms per character
  let typingTimeMs = charCount * msPerChar;

  // Apply a scaling factor for longer messages (people type faster when "in flow")
  // After 100 chars, typing speed increases by 10% for each additional 100 chars
  if (charCount > 100) {
    const flowBonus = Math.min(0.5, ((charCount - 100) / 100) * 0.1);
    typingTimeMs *= (1 - flowBonus);
  }

  // Calculate base total
  let totalDelayMs = thinkTimeMs + typingTimeMs;

  // Add jitter if enabled
  let jitterMs = 0;
  if (opts.addJitter) {
    const maxJitter = totalDelayMs * opts.jitterFactor;
    jitterMs = randomInRange(-maxJitter, maxJitter);
    totalDelayMs += jitterMs;
  }

  // Apply bounds: minimum 500ms, maximum 20 seconds
  // This prevents unrealistically fast or slow responses
  const MIN_DELAY_MS = 500;
  const MAX_DELAY_MS = 20000;
  totalDelayMs = Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, totalDelayMs));

  return {
    totalDelayMs: Math.round(totalDelayMs),
    thinkTimeMs: Math.round(thinkTimeMs),
    typingTimeMs: Math.round(typingTimeMs),
    jitterMs: Math.round(jitterMs),
  };
}

/**
 * Calculate cognitive pause delay between consecutive messages
 * Used when multiple messages are sent in quick succession
 *
 * This simulates the natural pause humans take between messages
 */
export function calculateCognitivePause(
  previousMessageTimestamp: number,
  minPauseMs: number = 2000,
  maxPauseMs: number = 5000
): number {
  const timeSinceLastMessage = Date.now() - previousMessageTimestamp;

  // If it's been more than 30 seconds, no extra pause needed
  if (timeSinceLastMessage > 30000) {
    return 0;
  }

  // Calculate pause with some randomness
  const basePause = randomInRange(minPauseMs, maxPauseMs);

  // Reduce pause if there's already been a natural gap
  const adjustedPause = Math.max(0, basePause - timeSinceLastMessage);

  return Math.round(adjustedPause);
}

/**
 * Get typing delay formatted for logging/debugging
 */
export function formatTypingDelay(result: TypingDelayResult): string {
  const seconds = (result.totalDelayMs / 1000).toFixed(1);
  return `${seconds}s (think: ${result.thinkTimeMs}ms, type: ${result.typingTimeMs}ms, jitter: ${result.jitterMs}ms)`;
}

/**
 * Helper: Generate random number in range [min, max]
 */
function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Estimate typing delay without randomness (for UI preview)
 * Returns the expected delay in seconds
 */
export function estimateTypingDelay(charCount: number, wpm: number = 50): number {
  const thinkTime = 2000; // Average think time
  const typingTime = charCount * (12000 / wpm);
  const total = thinkTime + typingTime;
  return Math.min(20, Math.max(0.5, total / 1000));
}
