/**
 * Knowledge Graph Skill
 * Retrieves relevant context from AutoMem knowledge graph
 */

import type {
  SkillManifest,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillHealthStatus,
} from '@secondme/shared-types';
import { AbstractSkill } from '../../base-skill.js';
import { knowledgeGraphManifest } from './manifest.js';
import {
  retrieveContext,
  isSemanticRagEnabled,
  type SemanticRagConfig,
} from '../../../retrieval/index.js';

/**
 * Knowledge Graph Skill - retrieves context from AutoMem
 */
export class KnowledgeGraphSkill extends AbstractSkill {
  readonly manifest: SkillManifest = knowledgeGraphManifest;

  /**
   * Execute the knowledge graph retrieval
   */
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    this.ensureActivated();
    const startTime = Date.now();

    // Get config values
    const maxPeople = this.getConfig(context, 'maxPeople', 10);
    const maxTopics = this.getConfig(context, 'maxTopics', 8);
    const maxEvents = this.getConfig(context, 'maxEvents', 5);
    const semanticEnabled = this.getConfig(context, 'semanticEnabled', true);
    const fallbackThreshold = this.getConfig(context, 'fallbackThreshold', 3);

    try {
      // Build config for hybrid retriever
      const retrievalConfig: Partial<SemanticRagConfig> = {
        enabled: semanticEnabled && isSemanticRagEnabled(),
        retrieval: {
          topK: {
            topics: maxTopics,
            people: maxPeople,
            events: maxEvents,
          },
          minScore: {
            topics: 0.7,
            people: 0.65,
            events: 0.7,
          },
        },
        fallbackThreshold,
      };

      // Execute retrieval
      const result = await retrieveContext(
        context.messageContent,
        context.contactId,
        retrievalConfig
      );

      // Format context for prompt
      const contextParts: string[] = [];

      if (result.context.people.length > 0) {
        const peopleStr = result.context.people
          .map((p) => {
            let desc = p.name;
            if (p.occupation) desc += ` (${p.occupation})`;
            if (p.company) desc += ` at ${p.company}`;
            if (p.notes) desc += ` - ${p.notes}`;
            return `- ${desc}`;
          })
          .join('\n');
        contextParts.push(`**People mentioned:**\n${peopleStr}`);
      }

      if (result.context.topics.length > 0) {
        const topicsStr = result.context.topics
          .map((t) => {
            let desc = t.name;
            if (t.category) desc += ` [${t.category}]`;
            if (t.times > 1) desc += ` (mentioned ${t.times}x)`;
            return `- ${desc}`;
          })
          .join('\n');
        contextParts.push(`**Relevant topics:**\n${topicsStr}`);
      }

      if (result.context.events.length > 0) {
        const eventsStr = result.context.events
          .map((e) => {
            let desc = e.name;
            if (e.date) desc += ` on ${e.date}`;
            if (e.description) desc += `: ${e.description}`;
            return `- ${desc}`;
          })
          .join('\n');
        contextParts.push(`**Recent events:**\n${eventsStr}`);
      }

      const contextStr = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

      const totalItems =
        result.context.people.length +
        result.context.topics.length +
        result.context.events.length;

      this.logger?.debug(`Knowledge graph retrieval completed`, {
        method: result.method,
        people: result.context.people.length,
        topics: result.context.topics.length,
        events: result.context.events.length,
        latencyMs: result.latencyMs,
      });

      const resultOptions: Parameters<typeof this.buildResult>[1] = {
        data: {
          graphContext: result.context,
          retrievalMethod: result.method,
        },
        itemCount: totalItems,
      };
      if (contextStr !== undefined) {
        resultOptions.context = contextStr;
      }
      if (result.stats?.embeddingCached !== undefined) {
        resultOptions.cached = result.stats.embeddingCached;
      }
      return this.buildResult(startTime, resultOptions);
    } catch (error) {
      this.logger?.error('Knowledge graph retrieval failed', {
        error: error instanceof Error ? error.message : String(error),
        contactId: context.contactId,
      });

      // Return empty result on error
      return this.buildResult(startTime, {
        data: {
          graphContext: { people: [], topics: [], events: [] },
          retrievalMethod: 'error',
        },
        itemCount: 0,
      });
    }
  }

  /**
   * Health check - verify AutoMem connectivity
   */
  override async healthCheck(): Promise<SkillHealthStatus> {
    // Basic check - if we're activated, we're healthy
    // More sophisticated check would ping AutoMem
    return this.activated ? 'healthy' : 'unhealthy';
  }
}
