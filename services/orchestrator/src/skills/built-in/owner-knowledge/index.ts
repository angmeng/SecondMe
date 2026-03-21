/**
 * Owner Knowledge Skill
 * Retrieves personal/professional knowledge about the bot owner from uploaded documents
 */

import type {
  SkillManifest,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillHealthStatus,
  ExtractedFact,
} from '@secondme/shared-types';
import { AbstractSkill } from '../../base-skill.js';
import { ownerKnowledgeManifest } from './manifest.js';
import { automemClient } from '../../../automem/client.js';
import type { RecallResult } from '../../../automem/memory-types.js';

/**
 * Parsed chunk content from AutoMem
 */
interface ChunkContent {
  text: string;
  facts?: ExtractedFact[];
  source: {
    documentId: string;
    filename: string;
    chunkIndex: number;
    totalChunks: number;
  };
}

/**
 * Owner Knowledge Skill - retrieves owner's personal context from uploaded documents
 */
export class OwnerKnowledgeSkill extends AbstractSkill {
  readonly manifest: SkillManifest = ownerKnowledgeManifest;

  /**
   * Execute the owner knowledge retrieval
   */
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    this.ensureActivated();
    const startTime = Date.now();

    // Get config values
    const maxChunks = this.getConfig(context, 'maxChunks', 3);
    const minRelevanceScore = this.getConfig(context, 'minRelevanceScore', 0.5);
    const includeFacts = this.getConfig(context, 'includeFacts', true);
    const categoryPriority = this.getConfig(context, 'categoryPriority', 'all');

    // Skip if AutoMem is not connected
    if (!automemClient.connected) {
      this.logger?.debug('AutoMem not connected, skipping owner knowledge retrieval');
      return this.buildResult(startTime, { itemCount: 0 });
    }

    try {
      // Build tags for query
      const tags = ['owner:knowledge'];
      if (categoryPriority !== 'all') {
        tags.push(`category:${categoryPriority}`);
      }

      // Query AutoMem for owner knowledge chunks
      const response = await automemClient.recall({
        query: context.messageContent,
        tags,
        tag_mode: categoryPriority === 'all' ? 'any' : 'all',
        tag_match: 'exact',
        limit: maxChunks * 2, // Get extra to filter by score
      });

      if (response.status !== 'success' || response.count === 0) {
        this.logger?.debug('No owner knowledge found');
        return this.buildResult(startTime, { itemCount: 0 });
      }

      // Filter by relevance score and parse content
      const relevantChunks = response.results
        .filter((r) => r.final_score >= minRelevanceScore)
        .slice(0, maxChunks);

      if (relevantChunks.length === 0) {
        this.logger?.debug('No chunks passed relevance threshold', {
          threshold: minRelevanceScore,
          candidates: response.count,
        });
        return this.buildResult(startTime, { itemCount: 0 });
      }

      // Parse and format the knowledge
      const { contextStr, allFacts } = this.formatKnowledge(relevantChunks, includeFacts);

      this.logger?.debug('Owner knowledge retrieved', {
        chunksRetrieved: relevantChunks.length,
        factsCount: allFacts.length,
        topScore: relevantChunks[0]?.final_score,
      });

      const resultOptions: Parameters<typeof this.buildResult>[1] = {
        data: {
          chunks: relevantChunks.map((r) => ({
            score: r.final_score,
            documentId: this.parseChunkContent(r)?.source.documentId,
          })),
          facts: allFacts,
        },
        itemCount: relevantChunks.length,
      };
      if (contextStr) {
        resultOptions.context = contextStr;
      }
      return this.buildResult(startTime, resultOptions);
    } catch (error) {
      this.logger?.error('Owner knowledge retrieval failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return empty result on error
      return this.buildResult(startTime, { itemCount: 0 });
    }
  }

  /**
   * Format knowledge from chunks into context string
   */
  private formatKnowledge(
    chunks: RecallResult[],
    includeFacts: boolean
  ): { contextStr: string; allFacts: ExtractedFact[] } {
    const contextParts: string[] = [];
    const allFacts: ExtractedFact[] = [];

    for (const chunk of chunks) {
      const content = this.parseChunkContent(chunk);
      if (!content) continue;

      // Add the text content
      if (content.text) {
        contextParts.push(content.text);
      }

      // Collect facts
      if (includeFacts && content.facts && content.facts.length > 0) {
        allFacts.push(...content.facts);
      }
    }

    // Deduplicate and format facts
    if (includeFacts && allFacts.length > 0) {
      const uniqueFacts = this.deduplicateFacts(allFacts);
      const factsStr = this.formatFacts(uniqueFacts);
      if (factsStr) {
        contextParts.push(factsStr);
      }
    }

    return {
      contextStr: contextParts.join('\n\n'),
      allFacts,
    };
  }

  /**
   * Parse chunk content from AutoMem memory
   */
  private parseChunkContent(result: RecallResult): ChunkContent | null {
    try {
      const content = JSON.parse(result.memory.content);
      if (typeof content === 'object' && content !== null && 'text' in content) {
        return content as ChunkContent;
      }
      return null;
    } catch {
      // If not JSON, treat the content as plain text
      return {
        text: result.memory.content,
        source: {
          documentId: 'unknown',
          filename: 'unknown',
          chunkIndex: 0,
          totalChunks: 1,
        },
      };
    }
  }

  /**
   * Deduplicate facts by content similarity
   */
  private deduplicateFacts(facts: ExtractedFact[]): ExtractedFact[] {
    const seen = new Set<string>();
    const unique: ExtractedFact[] = [];

    for (const fact of facts) {
      // Normalize content for comparison
      const normalized = fact.content.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(fact);
      }
    }

    // Sort by confidence (highest first)
    return unique.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Format facts into a string for the prompt
   */
  private formatFacts(facts: ExtractedFact[]): string | null {
    if (facts.length === 0) return null;

    const grouped = new Map<string, string[]>();

    for (const fact of facts) {
      const list = grouped.get(fact.type) || [];
      list.push(fact.content);
      grouped.set(fact.type, list);
    }

    const sections: string[] = [];

    // Order: skills, experience, education, achievements, interests, general
    const order: ExtractedFact['type'][] = [
      'skill',
      'experience',
      'education',
      'achievement',
      'interest',
      'general',
    ];

    for (const type of order) {
      const items = grouped.get(type);
      if (items && items.length > 0) {
        const label = type.charAt(0).toUpperCase() + type.slice(1) + 's';
        sections.push(`**${label}:** ${items.join('; ')}`);
      }
    }

    return sections.length > 0 ? `**Key Facts:**\n${sections.join('\n')}` : null;
  }

  /**
   * Health check - verify AutoMem connectivity
   */
  override async healthCheck(): Promise<SkillHealthStatus> {
    if (!this.activated) {
      return 'unhealthy';
    }

    return automemClient.connected ? 'healthy' : 'degraded';
  }
}
