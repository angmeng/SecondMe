/**
 * Anthropic Sonnet Client
 * Primary reasoning model with prompt caching for persona and context
 */

import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

if (!ANTHROPIC_API_KEY) {
  console.warn('[Sonnet Client] ANTHROPIC_API_KEY not set, client will fail at runtime');
}

interface ContextualResponse {
  response: string;
  tokensUsed: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

class SonnetClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate contextual response with prompt caching for persona and graph context
   */
  async getContextualResponse(
    content: string,
    personaStyleGuide: string,
    graphContext: { people: any[]; topics: any[] }
  ): Promise<ContextualResponse> {
    try {
      const startTime = Date.now();

      // Build cached system prompt with persona and graph schema
      const systemPrompt = this.buildCachedSystemPrompt(personaStyleGuide, graphContext);

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4.5-20250514',
        max_tokens: 1024,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: content,
          },
        ],
      });

      const latency = Date.now() - startTime;
      const responseText = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
      const cacheReadTokens = (response.usage as any).cache_read_input_tokens || 0;
      const cacheWriteTokens = (response.usage as any).cache_creation_input_tokens || 0;

      console.log(`[Sonnet Client] Contextual response generated (${latency}ms, ${tokensUsed} tokens, cache read: ${cacheReadTokens}, cache write: ${cacheWriteTokens})`);

      return {
        response: responseText,
        tokensUsed,
        cacheReadTokens,
        cacheWriteTokens,
      };
    } catch (error) {
      console.error('[Sonnet Client] Response generation error:', error);
      throw error;
    }
  }

  /**
   * Build system prompt with caching for persona and context
   */
  private buildCachedSystemPrompt(
    personaStyleGuide: string,
    graphContext: { people: any[]; topics: any[] }
  ): Anthropic.Messages.MessageCreateParams['system'] {
    // Format graph context as readable text
    const contextText = this.formatGraphContext(graphContext);

    // Return array of system message blocks with cache control
    return [
      {
        type: 'text',
        text: `You are responding on behalf of someone in a WhatsApp conversation. Your job is to mimic their communication style exactly and incorporate relevant contextual knowledge.`,
      },
      {
        type: 'text',
        text: `COMMUNICATION STYLE GUIDE:

${personaStyleGuide}

Follow this style guide precisely. Match the tone, formality level, emoji usage, and sentence structure.`,
        cache_control: { type: 'ephemeral' }, // Cache persona guide
      },
      {
        type: 'text',
        text: `CONTEXTUAL KNOWLEDGE ABOUT THIS CONTACT:

${contextText}

Use this context naturally in your response when relevant. Don't force it if it doesn't fit.`,
        cache_control: { type: 'ephemeral' }, // Cache graph context
      },
      {
        type: 'text',
        text: `RESPONSE GUIDELINES:
- Respond naturally as if you are the person
- Keep responses conversational and appropriate for WhatsApp
- Use context from the knowledge base when relevant
- Match the communication style exactly
- Don't reveal that you're an AI or mention the knowledge base
- Keep responses concise (typically 1-3 sentences for WhatsApp)`,
      },
    ];
  }

  /**
   * Format graph context into readable text
   */
  private formatGraphContext(graphContext: { people: any[]; topics: any[] }): string {
    const sections: string[] = [];

    // Format people and companies
    if (graphContext.people && graphContext.people.length > 0) {
      const peopleText = graphContext.people
        .map(p => {
          const parts = [p.personName || p['p.name']];
          if (p.occupation || p['p.occupation']) {
            parts.push(`works as ${p.occupation || p['p.occupation']}`);
          }
          if (p.companyName || p['comp.name']) {
            parts.push(`at ${p.companyName || p['comp.name']}`);
          }
          if (p.industry || p['comp.industry']) {
            parts.push(`(${p.industry || p['comp.industry']})`);
          }
          return parts.join(' ');
        })
        .join('\n- ');

      sections.push(`People and Relationships:\n- ${peopleText}`);
    }

    // Format topics
    if (graphContext.topics && graphContext.topics.length > 0) {
      const topicsText = graphContext.topics
        .map(t => {
          const name = t.topicName || t['t.name'];
          const category = t.category || t['t.category'];
          const times = t.times || t['m.times'];
          return `${name} (${category}) - mentioned ${times} time${times > 1 ? 's' : ''}`;
        })
        .join('\n- ');

      sections.push(`Topics Previously Discussed:\n- ${topicsText}`);
    }

    if (sections.length === 0) {
      return 'No specific context available for this contact yet.';
    }

    return sections.join('\n\n');
  }

  /**
   * Simple response without context (fallback)
   */
  async getSimpleResponse(
    content: string,
    personaStyleGuide: string
  ): Promise<ContextualResponse> {
    return this.getContextualResponse(content, personaStyleGuide, { people: [], topics: [] });
  }
}

// Export singleton instance
export const sonnetClient = new SonnetClient();
