/**
 * Anthropic Haiku Client
 * Fast router model for classifying messages as phatic vs substantive
 */

import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'] || '';

if (!ANTHROPIC_API_KEY) {
  console.warn('[Haiku Client] ANTHROPIC_API_KEY not set, client will fail at runtime');
}

class HaikuClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  /**
   * Classify message as "phatic" (simple acknowledgment) or "substantive" (requires context)
   */
  async classifyMessage(content: string): Promise<'phatic' | 'substantive'> {
    try {
      const startTime = Date.now();

      const response = await this.client.messages.create({
        model: 'claude-haiku-4.5-20250514',
        max_tokens: 50,
        temperature: 0.0, // Deterministic classification
        messages: [
          {
            role: 'user',
            content: `Classify this WhatsApp message as either "phatic" or "substantive":

Phatic: Simple acknowledgments, greetings, or short responses that don't require deep context (e.g., "ok", "lol", "thanks", "hey", "cool", "👍")

Substantive: Messages that ask questions, share information, or require contextual knowledge to respond properly (e.g., "How's work?", "Did you see the game?", "When are we meeting?")

Message: "${content}"

Classification (respond with only "phatic" or "substantive"):`,
          },
        ],
      });

      const latency = Date.now() - startTime;
      const firstBlock = response.content[0];
      const classification = firstBlock && firstBlock.type === 'text'
        ? firstBlock.text.trim().toLowerCase()
        : 'substantive';

      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

      console.log(`[Haiku Client] Classification: ${classification} (${latency}ms, ${tokensUsed} tokens)`);

      // Validate classification
      if (classification === 'phatic' || classification === 'substantive') {
        return classification;
      }

      // Default to substantive if classification is unclear
      console.warn(`[Haiku Client] Unexpected classification: ${classification}, defaulting to substantive`);
      return 'substantive';
    } catch (error) {
      console.error('[Haiku Client] Classification error:', error);
      // Default to substantive on error (safer to retrieve context than skip it)
      return 'substantive';
    }
  }

  /**
   * Get simple response for phatic messages (without context retrieval)
   */
  async getSimpleResponse(
    content: string,
    personaStyleGuide: string
  ): Promise<{ response: string; tokensUsed: number }> {
    try {
      const startTime = Date.now();

      const response = await this.client.messages.create({
        model: 'claude-haiku-4.5-20250514',
        max_tokens: 200,
        temperature: 0.7,
        system: `You are responding on behalf of someone. Match their communication style exactly:

${personaStyleGuide}

Respond briefly to this simple message. Keep it natural and concise.`,
        messages: [
          {
            role: 'user',
            content: content,
          },
        ],
      });

      const latency = Date.now() - startTime;
      const responseBlock = response.content[0];
      const responseText = responseBlock && responseBlock.type === 'text'
        ? responseBlock.text
        : '';

      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

      console.log(`[Haiku Client] Simple response generated (${latency}ms, ${tokensUsed} tokens)`);

      return {
        response: responseText,
        tokensUsed,
      };
    } catch (error) {
      console.error('[Haiku Client] Response generation error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const haikuClient = new HaikuClient();
