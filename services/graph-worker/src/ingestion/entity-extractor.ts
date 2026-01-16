/**
 * Entity Extractor - Claude-powered Knowledge Extraction
 * User Story 2: Extracts entities and relationships from chat messages
 */

import Anthropic from '@anthropic-ai/sdk';
import { ParsedMessage } from './chat-parser.js';

const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'] || '';

if (!ANTHROPIC_API_KEY) {
  console.warn('[Entity Extractor] ANTHROPIC_API_KEY not set, extractor will fail at runtime');
}

/**
 * Entity types extracted from conversations
 */
export type EntityType = 'PERSON' | 'COMPANY' | 'TOPIC' | 'EVENT' | 'LOCATION';

/**
 * Extracted entity with properties and relationships
 */
export interface ExtractedEntity {
  type: EntityType;
  name: string;
  properties: Record<string, string | number | boolean>;
  relationships: ExtractedRelationship[];
  confidence: number;
  sourceMessages: number[]; // Indexes into the original message array
}

/**
 * Relationship between entities
 */
export interface ExtractedRelationship {
  type: string;
  targetType: EntityType;
  targetName: string;
  properties?: Record<string, string | number | boolean>;
}

/**
 * Extraction result for a conversation chunk
 */
export interface ExtractionResult {
  entities: ExtractedEntity[];
  tokensUsed: number;
  latencyMs: number;
  error?: string;
}

/**
 * Entity Extractor class using Claude Sonnet
 */
class EntityExtractor {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  /**
   * Extract entities from a batch of messages
   */
  async extractFromMessages(
    messages: ParsedMessage[],
    contactName: string
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    if (messages.length === 0) {
      return {
        entities: [],
        tokensUsed: 0,
        latencyMs: 0,
      };
    }

    try {
      // Format messages for the prompt
      const messagesText = messages
        .map((m, i) => `[${i}] [${m.sender}]: ${m.content}`)
        .join('\n');

      const prompt = this.buildExtractionPrompt(messagesText, contactName);

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0.1, // Low temperature for consistent extraction
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const latencyMs = Date.now() - startTime;
      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

      // Parse the response
      const firstContent = response.content[0];
      const responseText = firstContent && firstContent.type === 'text' ? firstContent.text : '';
      const entities = this.parseExtractionResponse(responseText);

      console.log(
        `[Entity Extractor] Extracted ${entities.length} entities from ${messages.length} messages (${latencyMs}ms, ${tokensUsed} tokens)`
      );

      return {
        entities,
        tokensUsed,
        latencyMs,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      console.error('[Entity Extractor] Extraction error:', error);

      return {
        entities: [],
        tokensUsed: 0,
        latencyMs,
        error: error.message || 'Extraction failed',
      };
    }
  }

  /**
   * Build the extraction prompt
   */
  private buildExtractionPrompt(messagesText: string, contactName: string): string {
    return `Analyze this WhatsApp conversation with ${contactName} and extract entities mentioned.

CONVERSATION:
${messagesText}

Extract the following entity types:
1. PERSON: Names of people mentioned (NOT ${contactName} or the conversation participants)
2. COMPANY: Company or organization names
3. TOPIC: Subjects, hobbies, interests discussed (be specific, not generic)
4. EVENT: Specific events, meetings, plans, or occasions mentioned
5. LOCATION: Specific places mentioned (cities, venues, addresses)

For each entity provide:
- type: The entity type
- name: The entity name (normalized, proper casing)
- properties: Relevant details mentioned (occupation for PERSON, industry for COMPANY, date for EVENT, etc.)
- relationships: How entities relate (e.g., PERSON WORKS_AT COMPANY)
- confidence: 0.0-1.0 based on clarity of mention
- sourceMessages: Array of message indexes where mentioned

RULES:
- Only extract entities clearly mentioned in the text
- Do not infer relationships not explicitly stated
- Normalize names (e.g., "john" -> "John", "google" -> "Google")
- Merge duplicate entities (e.g., "John" and "John Smith" if clearly same person)
- Skip generic topics (e.g., "work", "stuff") - be specific
- Skip common greetings/pleasantries as topics

Respond ONLY with valid JSON in this format:
{
  "entities": [
    {
      "type": "PERSON",
      "name": "John Smith",
      "properties": { "occupation": "Software Engineer" },
      "relationships": [
        { "type": "WORKS_AT", "targetType": "COMPANY", "targetName": "Google" }
      ],
      "confidence": 0.9,
      "sourceMessages": [2, 5]
    }
  ]
}

If no entities found, return: {"entities": []}`;
  }

  /**
   * Parse the extraction response JSON
   */
  private parseExtractionResponse(responseText: string): ExtractedEntity[] {
    try {
      // Find JSON in the response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[Entity Extractor] No JSON found in response');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.entities || !Array.isArray(parsed.entities)) {
        return [];
      }

      // Validate and normalize entities
      return parsed.entities
        .filter((e: any) => this.isValidEntity(e))
        .map((e: any) => this.normalizeEntity(e));
    } catch (error) {
      console.error('[Entity Extractor] Failed to parse response:', error);
      return [];
    }
  }

  /**
   * Validate extracted entity
   */
  private isValidEntity(entity: any): boolean {
    if (!entity || typeof entity !== 'object') return false;
    if (!entity.type || !entity.name) return false;

    const validTypes: EntityType[] = ['PERSON', 'COMPANY', 'TOPIC', 'EVENT', 'LOCATION'];
    if (!validTypes.includes(entity.type)) return false;

    if (typeof entity.name !== 'string' || entity.name.trim().length === 0) return false;

    return true;
  }

  /**
   * Normalize extracted entity
   */
  private normalizeEntity(entity: any): ExtractedEntity {
    return {
      type: entity.type as EntityType,
      name: this.normalizeName(entity.name, entity.type),
      properties: entity.properties || {},
      relationships: (entity.relationships || []).map((r: any) => ({
        type: r.type || 'RELATED_TO',
        targetType: r.targetType || 'TOPIC',
        targetName: this.normalizeName(r.targetName || '', r.targetType),
        properties: r.properties,
      })),
      confidence: typeof entity.confidence === 'number' ? entity.confidence : 0.5,
      sourceMessages: Array.isArray(entity.sourceMessages) ? entity.sourceMessages : [],
    };
  }

  /**
   * Normalize entity name
   */
  private normalizeName(name: string, type: EntityType): string {
    const trimmed = name.trim();

    // Title case for persons and companies
    if (type === 'PERSON' || type === 'COMPANY') {
      return trimmed
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }

    // Title case for locations
    if (type === 'LOCATION') {
      return trimmed
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }

    // Capitalize first letter for topics and events
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  /**
   * Deduplicate entities by name and type
   */
  deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const entityMap = new Map<string, ExtractedEntity>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.name.toLowerCase()}`;

      if (entityMap.has(key)) {
        // Merge with existing entity
        const existing = entityMap.get(key)!;
        existing.properties = { ...existing.properties, ...entity.properties };
        existing.relationships = [...existing.relationships, ...entity.relationships];
        existing.sourceMessages = [...new Set([...existing.sourceMessages, ...entity.sourceMessages])];
        existing.confidence = Math.max(existing.confidence, entity.confidence);
      } else {
        entityMap.set(key, { ...entity });
      }
    }

    // Deduplicate relationships within each entity
    for (const entity of entityMap.values()) {
      const relMap = new Map<string, ExtractedRelationship>();
      for (const rel of entity.relationships) {
        const key = `${rel.type}:${rel.targetType}:${rel.targetName.toLowerCase()}`;
        if (!relMap.has(key)) {
          relMap.set(key, rel);
        }
      }
      entity.relationships = Array.from(relMap.values());
    }

    return Array.from(entityMap.values());
  }
}

// Export singleton instance
export const entityExtractor = new EntityExtractor();

/**
 * Extract entities from a batch of messages (convenience function)
 */
export async function extractEntities(
  messages: ParsedMessage[],
  contactName: string
): Promise<ExtractionResult> {
  return entityExtractor.extractFromMessages(messages, contactName);
}

/**
 * Deduplicate entities (convenience function)
 */
export function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  return entityExtractor.deduplicateEntities(entities);
}
