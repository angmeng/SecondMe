/**
 * Conversation History Skill
 * Retrieves recent conversation history for RAG context
 */

import type {
  SkillManifest,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillHealthStatus,
  ConversationMessage,
} from '@secondme/shared-types';
import { AbstractSkill } from '../../base-skill.js';
import { conversationHistoryManifest } from './manifest.js';
import { historyCache } from '../../../history/index.js';

/**
 * Conversation History Skill - retrieves recent message history
 */
export class ConversationHistorySkill extends AbstractSkill {
  readonly manifest: SkillManifest = conversationHistoryManifest;

  /**
   * Execute conversation history retrieval
   */
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    this.ensureActivated();
    const startTime = Date.now();

    // Get config values
    const enabled = this.getConfig(context, 'enabled', true);
    const tokenBudget = this.getConfig(context, 'tokenBudget', 2000);

    // Skip if disabled
    if (!enabled) {
      this.logger?.debug('Conversation history skill is disabled');
      return this.buildResult(startTime, {
        data: {
          history: [],
          historyMessageCount: 0,
          skipped: true,
        },
        itemCount: 0,
      });
    }

    try {
      // Get history using the existing history cache (which handles chunking internally)
      const historyResult = await historyCache.getRecentHistory(context.contactId);

      // Apply token budget if necessary
      let messages = historyResult.messages;
      let tokenEstimate = historyResult.tokenEstimate;

      if (tokenEstimate > tokenBudget) {
        // Truncate messages to fit budget
        const truncated = this.truncateToTokenBudget(messages, tokenBudget);
        messages = truncated.messages;
        tokenEstimate = truncated.tokenEstimate;
      }

      // Format context for prompt if there are messages
      let contextStr: string | undefined;

      if (messages.length > 0) {
        const formattedMessages = messages.map((m) => {
          const role = m.role === 'user' ? 'Contact' : 'You';
          return `${role}: ${m.content}`;
        });

        contextStr = `**Recent conversation:**\n${formattedMessages.join('\n')}`;
      }

      this.logger?.debug('Conversation history retrieved', {
        contactId: context.contactId,
        messageCount: messages.length,
        tokenEstimate,
        method: historyResult.method,
      });

      const resultOptions: Parameters<typeof this.buildResult>[1] = {
        data: {
          conversationHistory: messages,
          historyMessageCount: messages.length,
          tokenEstimate,
        },
        itemCount: messages.length,
      };
      if (contextStr !== undefined) {
        resultOptions.context = contextStr;
      }
      return this.buildResult(startTime, resultOptions);
    } catch (error) {
      this.logger?.error('Conversation history retrieval failed', {
        error: error instanceof Error ? error.message : String(error),
        contactId: context.contactId,
      });

      return this.buildResult(startTime, {
        data: {
          conversationHistory: [],
          historyMessageCount: 0,
          error: true,
        },
        itemCount: 0,
      });
    }
  }

  /**
   * Truncate messages to fit within token budget
   */
  private truncateToTokenBudget(
    messages: ConversationMessage[],
    budget: number
  ): { messages: ConversationMessage[]; tokenEstimate: number } {
    const result: ConversationMessage[] = [];
    let tokens = 0;

    // Start from most recent (end of array) and work backwards
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!;
      // Estimate ~4 chars per token + 10 tokens overhead per message
      const msgTokens = Math.ceil(msg.content.length / 4) + 10;

      if (tokens + msgTokens > budget) {
        break;
      }

      result.unshift(msg);
      tokens += msgTokens;
    }

    return {
      messages: result,
      tokenEstimate: tokens,
    };
  }

  /**
   * Health check
   */
  override async healthCheck(): Promise<SkillHealthStatus> {
    return this.activated ? 'healthy' : 'unhealthy';
  }
}
