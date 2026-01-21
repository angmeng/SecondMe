/**
 * Anthropic Sonnet Client
 * Primary reasoning model with prompt caching for persona and context
 */

import Anthropic from '@anthropic-ai/sdk';
import { type StyleProfile } from '../automem/recall.js';
import { type ConversationMessage } from '../history/index.js';

const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'] || '';

if (!ANTHROPIC_API_KEY) {
  console.warn('[Sonnet Client] ANTHROPIC_API_KEY not set, client will fail at runtime');
}

interface ContextualResponse {
  response: string;
  tokensUsed: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Person/company context from knowledge graph */
interface PersonContext {
  personName?: string;
  'p.name'?: string;
  occupation?: string;
  'p.occupation'?: string;
  companyName?: string;
  'comp.name'?: string;
  industry?: string;
  'comp.industry'?: string;
}

/** Topic context from knowledge graph */
interface TopicContext {
  topicName?: string;
  't.name'?: string;
  category?: string;
  't.category'?: string;
  times?: number;
  'm.times'?: number;
}

/** Graph context containing people and topics */
interface GraphContext {
  people: PersonContext[];
  topics: TopicContext[];
}

/** Usage type with cache token fields (beta feature) */
type UsageWithCache = Anthropic.Messages.Usage & {
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

class SonnetClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate contextual response with prompt caching for persona and graph context
   * Now supports conversation history for multi-turn context
   */
  async getContextualResponse(
    content: string,
    personaStyleGuide: string,
    graphContext: GraphContext,
    styleProfile?: StyleProfile | null,
    conversationHistory?: ConversationMessage[]
  ): Promise<ContextualResponse> {
    try {
      const startTime = Date.now();

      // Build cached system prompt with persona, graph schema, and style profile
      const systemPrompt = this.buildCachedSystemPrompt(personaStyleGuide, graphContext, styleProfile);

      // Build messages array with conversation history
      const messages = this.buildMessagesWithHistory(content, conversationHistory);

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        temperature: 0.7,
        system: systemPrompt,
        messages,
      });

      const latency = Date.now() - startTime;
      const firstBlock = response.content[0];
      const responseText = firstBlock && firstBlock.type === 'text'
        ? firstBlock.text
        : '';

      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
      const usageWithCache = response.usage as UsageWithCache;
      const cacheReadTokens = usageWithCache.cache_read_input_tokens || 0;
      const cacheWriteTokens = usageWithCache.cache_creation_input_tokens || 0;
      const historyCount = conversationHistory?.length ?? 0;

      console.log(`[Sonnet Client] Contextual response generated (${latency}ms, ${tokensUsed} tokens, cache read: ${cacheReadTokens}, cache write: ${cacheWriteTokens}, history: ${historyCount} msgs)`);

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
   * Build messages array with conversation history
   * History messages come first (chronological), then the current message
   */
  private buildMessagesWithHistory(
    currentContent: string,
    history?: ConversationMessage[]
  ): Anthropic.Messages.MessageParam[] {
    const messages: Anthropic.Messages.MessageParam[] = [];

    // Add conversation history if available
    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current message
    messages.push({
      role: 'user',
      content: currentContent,
    });

    return messages;
  }

  /**
   * Build system prompt with caching for persona, context, and style profile
   */
  private buildCachedSystemPrompt(
    personaStyleGuide: string,
    graphContext: GraphContext,
    styleProfile?: StyleProfile | null
  ): Anthropic.Messages.TextBlockParam[] {
    // Format graph context as readable text
    const contextText = this.formatGraphContext(graphContext);

    // Format style profile if available
    const styleText = styleProfile ? this.formatStyleProfile(styleProfile) : null;

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
      // Style profile block (only if available with sufficient samples)
      ...(styleText
        ? [
            {
              type: 'text' as const,
              text: styleText,
              cache_control: { type: 'ephemeral' as const }, // Cache style profile
            },
          ]
        : []),
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
   * Format style profile for prompt injection
   * Returns null if insufficient samples (< 10 messages)
   */
  private formatStyleProfile(profile: StyleProfile): string | null {
    // Require minimum samples for reliable style inference
    if (profile.sampleCount < 10) {
      return null;
    }

    // Describe message length
    const lengthDesc =
      profile.avgMessageLength < 50
        ? 'brief'
        : profile.avgMessageLength < 100
          ? 'moderate'
          : 'detailed';

    // Describe emoji usage
    const emojiDesc =
      profile.emojiFrequency < 0.2
        ? 'rarely use emojis'
        : profile.emojiFrequency < 0.8
          ? 'occasionally use emojis'
          : 'frequently use emojis';

    // Describe formality
    const formalityDesc =
      profile.formalityScore < 0.3
        ? 'casual'
        : profile.formalityScore < 0.7
          ? 'semi-formal'
          : 'formal';

    // Build style notes from punctuation patterns
    const styleNotes: string[] = [];

    if (profile.punctuationStyle?.usesEllipsis) {
      styleNotes.push('You often use ellipsis (...)');
    }
    if (profile.punctuationStyle?.exclamationFrequency > 0.3) {
      styleNotes.push('You frequently use exclamation marks!');
    }
    if (profile.punctuationStyle?.endsWithPeriod === false) {
      styleNotes.push('You often skip ending periods');
    }

    // Format greetings if available
    const greetingsLine =
      profile.greetingStyle && profile.greetingStyle.length > 0
        ? `- Common greetings you use: "${profile.greetingStyle.slice(0, 3).join('", "')}"`
        : '';

    // Format sign-offs if available
    const signOffsLine =
      profile.signOffStyle && profile.signOffStyle.length > 0
        ? `- Common sign-offs you use: "${profile.signOffStyle.slice(0, 3).join('", "')}"`
        : '';

    const styleNotesText = styleNotes.map((note) => `- ${note}`).join('\n');

    return `YOUR MESSAGING STYLE WITH THIS CONTACT:
Based on ${profile.sampleCount} of your previous messages to this person:
- Message length: ${lengthDesc} (~${Math.round(profile.avgMessageLength)} characters)
- Emoji usage: ${emojiDesc}
- Tone: ${formalityDesc}
${greetingsLine}
${signOffsLine}
${styleNotesText}

Match these patterns in your response.`.trim();
  }

  /**
   * Format graph context into readable text
   */
  private formatGraphContext(graphContext: GraphContext): string {
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
          const times = t.times ?? t['m.times'] ?? 1;
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
