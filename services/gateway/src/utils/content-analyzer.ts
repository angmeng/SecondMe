/**
 * Content Analyzer
 * Analyzes incoming messages for security concerns
 *
 * PHILOSOPHY:
 * - Detection only, NOT modification
 * - Flag and log suspicious content
 * - Pass original message to AI for processing
 * - Let Claude handle context interpretation
 */

import type { ContentFlag, ContentFlagType, ContentAnalysis } from '@secondme/shared-types';
import { parseIntEnv } from '@secondme/shared-types';

/**
 * Static blocklist of suspicious domains
 * No external API calls in the hot path
 */
const SUSPICIOUS_DOMAINS = new Set([
  // URL shorteners (can hide malicious links)
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  't.co',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'j.mp',
  'rb.gy',
  'cutt.ly',
  'shorturl.at',
  // Known phishing domains (sample - would be expanded)
  'secure-login-verify.com',
  'account-verify-update.com',
]);

/**
 * URL shortener domains (subset of suspicious for specific flagging)
 */
const URL_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  't.co',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'j.mp',
  'rb.gy',
  'cutt.ly',
  'shorturl.at',
]);

/**
 * Configuration from environment
 */
const MAX_MESSAGE_LENGTH = parseIntEnv('MAX_MESSAGE_LENGTH', 4000);
const MIN_REPEAT_LENGTH = parseIntEnv('CONTENT_MIN_REPEAT_LENGTH', 10);
const MIN_REPEAT_COUNT = parseIntEnv('CONTENT_MIN_REPEAT_COUNT', 3);

/**
 * URL regex pattern
 */
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

/**
 * Control characters pattern (except newlines, tabs)
 */
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Repeated pattern detection regex
 * Matches same 10+ chars repeated 3+ times
 */
function createRepeatPattern(minLength: number, minCount: number): RegExp {
  return new RegExp(`(.{${minLength},})\\1{${minCount - 1},}`);
}

/**
 * Analyze URLs in content for suspicious domains
 */
function analyzeUrls(content: string): ContentFlag[] {
  const flags: ContentFlag[] = [];
  const urls = content.match(URL_PATTERN) || [];

  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();

      // Check for URL shorteners
      if (URL_SHORTENERS.has(domain)) {
        flags.push({
          type: 'url_shortener' as ContentFlagType,
          details: `URL shortener detected: ${domain}`,
          position: content.indexOf(url),
        });
      }
      // Check for other suspicious domains
      else if (SUSPICIOUS_DOMAINS.has(domain)) {
        flags.push({
          type: 'url_suspicious' as ContentFlagType,
          details: `Suspicious domain: ${domain}`,
          position: content.indexOf(url),
        });
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return flags;
}

/**
 * Detect control characters in content
 */
function analyzeControlChars(content: string): ContentFlag[] {
  const flags: ContentFlag[] = [];
  const matches = content.match(CONTROL_CHARS_PATTERN);

  if (matches && matches.length > 0) {
    flags.push({
      type: 'control_chars' as ContentFlagType,
      details: `${matches.length} control character(s) found`,
    });
  }

  return flags;
}

/**
 * Check message length
 */
function analyzeLength(content: string): ContentFlag[] {
  const flags: ContentFlag[] = [];

  if (content.length > MAX_MESSAGE_LENGTH) {
    flags.push({
      type: 'excessive_length' as ContentFlagType,
      details: `Message length ${content.length} exceeds limit ${MAX_MESSAGE_LENGTH}`,
    });
  }

  return flags;
}

/**
 * Detect suspicious repeated patterns
 */
function analyzeRepetition(content: string): ContentFlag[] {
  const flags: ContentFlag[] = [];
  const repeatPattern = createRepeatPattern(MIN_REPEAT_LENGTH, MIN_REPEAT_COUNT);

  if (repeatPattern.test(content)) {
    flags.push({
      type: 'repeated_pattern' as ContentFlagType,
      details: 'Suspicious repetition detected',
    });
  }

  return flags;
}

/**
 * Detect potential injection patterns
 * Looks for common injection-like sequences that shouldn't appear in normal messages
 */
function analyzeInjection(content: string): ContentFlag[] {
  const flags: ContentFlag[] = [];

  // Patterns that might indicate injection attempts
  const injectionPatterns = [
    // SQL-like patterns
    /('|")\s*(OR|AND)\s*('|")\s*=\s*\1/i,
    // Script tags
    /<script\b/i,
    // Common XSS vectors
    /javascript:/i,
    /on\w+\s*=/i,
    // Command injection patterns
    /;\s*(rm|cat|wget|curl|bash|sh)\s/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(content)) {
      flags.push({
        type: 'potential_injection' as ContentFlagType,
        details: 'Potential injection pattern detected',
      });
      break; // Only flag once for injection
    }
  }

  return flags;
}

/**
 * Calculate risk score based on flags
 * Score ranges from 0 (no risk) to 1 (high risk)
 */
function calculateRiskScore(flags: ContentFlag[]): number {
  // Weight different flag types
  const weights: Record<ContentFlagType, number> = {
    url_suspicious: 0.4,
    url_shortener: 0.2,
    control_chars: 0.3,
    excessive_length: 0.1,
    repeated_pattern: 0.2,
    potential_injection: 0.5,
  };

  let score = 0;
  for (const flag of flags) {
    score += weights[flag.type] || 0.1;
  }

  return Math.min(1, score);
}

/**
 * Analyze content for security concerns
 *
 * IMPORTANT: This function does NOT modify the content.
 * It only analyzes and flags potential issues.
 * The original content should be passed through to the AI unmodified.
 *
 * @param content - The message content to analyze
 * @returns Analysis result with flags and risk score
 */
export function analyzeContent(content: string): ContentAnalysis {
  const flags: ContentFlag[] = [
    ...analyzeUrls(content),
    ...analyzeControlChars(content),
    ...analyzeLength(content),
    ...analyzeRepetition(content),
    ...analyzeInjection(content),
  ];

  const riskScore = calculateRiskScore(flags);

  return {
    original: content,
    flags,
    riskScore,
    shouldLog: flags.length > 0,
  };
}

/**
 * Quick check if content needs detailed analysis
 * Use this for early bailout in high-traffic scenarios
 */
export function needsAnalysis(content: string): boolean {
  // Skip very short messages
  if (content.length < 10) return false;

  // Check for obvious indicators
  return (
    content.includes('http') ||
    content.length > MAX_MESSAGE_LENGTH * 0.8 ||
    CONTROL_CHARS_PATTERN.test(content)
  );
}

/**
 * Get a summary of flags for logging
 */
export function getFlagSummary(analysis: ContentAnalysis): string {
  if (analysis.flags.length === 0) return 'clean';

  return analysis.flags.map((f) => f.type).join(', ');
}
