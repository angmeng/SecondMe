/**
 * Prompt Template Builder
 * User Story 2: Constructs system prompts with persona and context injection
 * Supports Anthropic prompt caching for cost optimization
 */

import Anthropic from '@anthropic-ai/sdk';
import { ContactContext, PersonaContext } from '../falkordb/queries.js';

/**
 * Build cached system prompt for Sonnet with persona and graph context
 * Returns array of message blocks with cache control hints
 */
export function buildContextualSystemPrompt(
  persona: PersonaContext,
  context: ContactContext,
  contactName: string
): Anthropic.Messages.MessageCreateParams['system'] {
  const contextText = formatGraphContext(context, contactName);
  const examplesText = formatExampleMessages(persona.exampleMessages);

  return [
    {
      type: 'text',
      text: `You are responding on behalf of someone in a WhatsApp conversation. Your job is to mimic their communication style exactly and incorporate relevant contextual knowledge about the person you're chatting with.

CRITICAL RULES:
- You ARE the user. Respond as them, not as an AI assistant.
- Never reveal that you're an AI or mention the knowledge base.
- Never break character or explain your reasoning.
- Keep responses concise and natural for WhatsApp (typically 1-3 sentences).
- Match the communication style precisely.`,
    },
    {
      type: 'text',
      text: `PERSONA: ${persona.name}

COMMUNICATION STYLE GUIDE:
${persona.styleGuide}

TONE: ${persona.tone}

${examplesText}

Follow this style guide precisely. Match the tone, formality level, emoji usage, and sentence structure shown in the examples.`,
      cache_control: { type: 'ephemeral' }, // Cache persona guide
    },
    {
      type: 'text',
      text: `CONTEXTUAL KNOWLEDGE ABOUT ${contactName.toUpperCase()}:

${contextText}

Use this context naturally in your response when relevant. Don't force it if it doesn't fit the conversation.`,
      cache_control: { type: 'ephemeral' }, // Cache graph context
    },
    {
      type: 'text',
      text: `RESPONSE GUIDELINES:
- Respond naturally as if you are the person
- Keep responses conversational and appropriate for WhatsApp
- Reference shared knowledge when it adds value to the conversation
- Don't ask questions unless the conversation naturally calls for it
- Match the energy and engagement level of the incoming message`,
    },
  ];
}

/**
 * Build simple system prompt for Haiku (phatic messages)
 * No caching needed for short-lived simple responses
 */
export function buildSimpleSystemPrompt(persona: PersonaContext): string {
  return `You are responding on behalf of someone in WhatsApp. Match their style exactly.

STYLE: ${persona.styleGuide}

TONE: ${persona.tone}

Keep responses very brief and natural. You ARE the user - never break character.`;
}

/**
 * Format graph context into readable text for the prompt
 */
function formatGraphContext(context: ContactContext, contactName: string): string {
  const sections: string[] = [];

  // Format people and relationships
  if (context.people && context.people.length > 0) {
    const peopleText = context.people
      .map((p) => {
        const parts = [p.name];
        if (p.occupation) {
          parts.push(`works as ${p.occupation}`);
        }
        if (p.company) {
          parts.push(`at ${p.company}`);
          if (p.industry) {
            parts.push(`(${p.industry})`);
          }
        }
        if (p.notes) {
          parts.push(`- ${p.notes}`);
        }
        return `  - ${parts.join(' ')}`;
      })
      .join('\n');

    sections.push(`People ${contactName} knows:\n${peopleText}`);
  }

  // Format topics discussed
  if (context.topics && context.topics.length > 0) {
    const topicsText = context.topics
      .map((t) => {
        const timesLabel = t.times > 1 ? `mentioned ${t.times} times` : 'mentioned once';
        const category = t.category ? ` (${t.category})` : '';
        return `  - ${t.name}${category} - ${timesLabel}`;
      })
      .join('\n');

    sections.push(`Topics previously discussed:\n${topicsText}`);
  }

  // Format events
  if (context.events && context.events.length > 0) {
    const eventsText = context.events
      .map((e) => {
        const parts = [e.name];
        if (e.date) parts.push(`on ${e.date}`);
        if (e.location) parts.push(`at ${e.location}`);
        if (e.description) parts.push(`- ${e.description}`);
        return `  - ${parts.join(' ')}`;
      })
      .join('\n');

    sections.push(`Relevant events:\n${eventsText}`);
  }

  if (sections.length === 0) {
    return 'No specific context available for this contact yet. Respond naturally based on the message content.';
  }

  return sections.join('\n\n');
}

/**
 * Format example messages for the prompt
 */
function formatExampleMessages(examples: string[]): string {
  if (!examples || examples.length === 0) {
    return '';
  }

  const examplesText = examples.map((ex, i) => `  ${i + 1}. "${ex}"`).join('\n');
  return `EXAMPLE MESSAGES (match this style):\n${examplesText}`;
}

/**
 * Build entity extraction prompt for Claude
 * Used by graph-worker for knowledge extraction
 */
export function buildEntityExtractionPrompt(
  messages: Array<{ sender: string; content: string; timestamp: number }>
): string {
  const messagesText = messages
    .map((m) => `[${m.sender}]: ${m.content}`)
    .join('\n');

  return `Analyze the following WhatsApp conversation and extract entities mentioned.

CONVERSATION:
${messagesText}

Extract the following types of entities:
1. PERSON: Names of people mentioned (not the conversation participants)
2. COMPANY: Company or organization names
3. TOPIC: Subjects, hobbies, interests discussed
4. EVENT: Specific events, meetings, or plans mentioned
5. LOCATION: Places mentioned

For each entity, provide:
- type: The entity type (PERSON, COMPANY, TOPIC, EVENT, LOCATION)
- name: The entity name
- properties: Any additional properties mentioned (e.g., occupation for PERSON, date for EVENT)
- relationships: How entities relate to each other (e.g., "John WORKS_AT Google")

Respond in JSON format:
{
  "entities": [
    {
      "type": "PERSON",
      "name": "John",
      "properties": { "occupation": "Software Engineer" },
      "relationships": [
        { "type": "WORKS_AT", "target": "Google" }
      ]
    }
  ]
}

Only extract entities that are clearly mentioned. Do not infer or guess.`;
}

/**
 * Build classification prompt for router (used as fallback if Haiku client is unavailable)
 */
export function buildClassificationPrompt(content: string): string {
  return `Classify this WhatsApp message as either "phatic" or "substantive":

Phatic: Simple acknowledgments, greetings, or short responses that don't require deep context (e.g., "ok", "lol", "thanks", "hey", "cool")

Substantive: Messages that ask questions, share information, or require contextual knowledge to respond properly (e.g., "How's work?", "Did you see the game?", "When are we meeting?")

Message: "${content}"

Classification (respond with only "phatic" or "substantive"):`;
}
