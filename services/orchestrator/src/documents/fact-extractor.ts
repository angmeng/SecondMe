/**
 * Fact Extractor
 * Extracts structured facts from document chunks using Claude Haiku
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedFact } from '@secondme/shared-types';

const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'] || '';

/**
 * Prompt for fact extraction
 */
const EXTRACTION_PROMPT = `You are analyzing a personal document to extract key facts about the person.
Extract and categorize each distinct fact into one of these types:
- skill: Technical skills, languages, tools, methodologies
- experience: Work history, roles, projects, achievements
- education: Degrees, certifications, courses, training
- interest: Hobbies, passions, personal interests
- achievement: Awards, recognitions, accomplishments
- general: Other relevant biographical information

For each fact:
1. Keep it concise (1-2 sentences max)
2. Include specific details when available (years, names, numbers)
3. Assign a confidence score from 0.0 to 1.0 (1.0 = explicitly stated, lower = inferred)

Document excerpt:
{content}

Return ONLY a valid JSON array with no other text, markdown, or explanation:
[{"type": "skill", "content": "Python programming with 5 years experience", "confidence": 0.95}, ...]

If no facts can be extracted, return an empty array: []`;

/**
 * Fact Extractor class using Claude Haiku
 */
export class FactExtractor {
  private client: Anthropic;
  private enabled: boolean;

  constructor() {
    this.enabled = !!ANTHROPIC_API_KEY;
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });

    if (!this.enabled) {
      console.warn('[FactExtractor] No API key, fact extraction disabled');
    }
  }

  /**
   * Check if fact extraction is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Extract facts from a document chunk
   *
   * @param chunkContent - Text content of the chunk
   * @returns Array of extracted facts
   */
  async extractFacts(chunkContent: string): Promise<ExtractedFact[]> {
    if (!this.enabled) {
      console.warn('[FactExtractor] Extraction disabled, returning empty array');
      return [];
    }

    // Skip if content is too short to contain meaningful facts
    if (chunkContent.trim().length < 50) {
      return [];
    }

    try {
      const startTime = Date.now();

      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        temperature: 0.0, // Deterministic extraction
        messages: [
          {
            role: 'user',
            content: EXTRACTION_PROMPT.replace('{content}', chunkContent),
          },
        ],
      });

      const latency = Date.now() - startTime;
      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

      // Extract text from response
      const firstBlock = response.content[0];
      const responseText =
        firstBlock && firstBlock.type === 'text' ? firstBlock.text.trim() : '[]';

      // Parse JSON response
      const facts = this.parseFactsResponse(responseText);

      console.log(
        `[FactExtractor] Extracted ${facts.length} facts (${latency}ms, ${tokensUsed} tokens)`
      );

      return facts;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[FactExtractor] Extraction failed:', message);
      // Return empty array on failure - don't block document processing
      return [];
    }
  }

  /**
   * Extract facts from multiple chunks in parallel with concurrency limit
   *
   * @param chunks - Array of chunk contents
   * @param concurrency - Maximum concurrent API calls (default: 3)
   * @returns Map of chunk index to extracted facts
   */
  async extractFactsBatch(
    chunks: string[],
    concurrency: number = 3
  ): Promise<Map<number, ExtractedFact[]>> {
    const results = new Map<number, ExtractedFact[]>();

    if (!this.enabled || chunks.length === 0) {
      return results;
    }

    // Process in batches with concurrency limit
    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency);
      const batchPromises = batch.map((content, batchIndex) =>
        this.extractFacts(content).then((facts) => ({
          index: i + batchIndex,
          facts,
        }))
      );

      const batchResults = await Promise.all(batchPromises);

      for (const { index, facts } of batchResults) {
        results.set(index, facts);
      }
    }

    return results;
  }

  /**
   * Parse the JSON response from Claude
   */
  private parseFactsResponse(responseText: string): ExtractedFact[] {
    try {
      // Remove markdown code blocks if present
      let jsonText = responseText;
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed: unknown = JSON.parse(jsonText);

      // Validate array
      if (!Array.isArray(parsed)) {
        console.warn('[FactExtractor] Response is not an array');
        return [];
      }

      // Validate and filter facts
      const validFacts: ExtractedFact[] = [];
      const validTypes = ['skill', 'experience', 'education', 'interest', 'achievement', 'general'];

      for (const item of parsed) {
        if (
          typeof item === 'object' &&
          item !== null &&
          typeof item.type === 'string' &&
          validTypes.includes(item.type) &&
          typeof item.content === 'string' &&
          typeof item.confidence === 'number' &&
          item.confidence >= 0 &&
          item.confidence <= 1
        ) {
          validFacts.push({
            type: item.type as ExtractedFact['type'],
            content: item.content,
            confidence: item.confidence,
          });
        }
      }

      return validFacts;
    } catch (error) {
      console.warn('[FactExtractor] Failed to parse response:', responseText.slice(0, 100));
      return [];
    }
  }
}

// Singleton instance (lazy initialization)
let factExtractor: FactExtractor | null = null;

/**
 * Get the global fact extractor instance
 */
export function getFactExtractor(): FactExtractor {
  if (!factExtractor) {
    factExtractor = new FactExtractor();
  }
  return factExtractor;
}

/**
 * Reset the global extractor instance (for testing)
 */
export function resetFactExtractor(): void {
  factExtractor = null;
}
