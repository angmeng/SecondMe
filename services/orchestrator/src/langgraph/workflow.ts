/**
 * LangGraph Workflow for Message Processing
 * User Story 2 & 3: Enhanced workflow with persona-based responses, knowledge graph context,
 * and Human Typing Simulation (HTS) for natural behavior
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { sonnetClient } from '../anthropic/sonnet-client.js';
import { haikuClient } from '../anthropic/haiku-client.js';
import { redisClient } from '../redis/client.js';
import { routerNode } from './router-node.js';
import { contextRetrievalNode } from './graph-node.js';
import { type ContactContext, type PersonaContext, type ContactInfo, type StyleProfile } from '../automem/recall.js';
import { type ConversationMessage } from '../history/index.js';
import {
  calculateTypingDelay as calculateHTSTypingDelay,
  calculateCognitivePause,
  formatTypingDelay,
  isSleepHours,
  queueDeferredMessage,
} from '../hts/index.js';
import { RelationshipSignal } from './relationship-signals.js';
import { getVoiceTranscriber, getVoiceSynthesizer } from '../media/index.js';
import { metricsCollector } from '../metrics/collector.js';
import type { ImageContent, MediaType, VoicePreference } from '@secondme/shared-types';
import {
  getVoicePreferenceWithCache,
  getDefaultVoicePreference,
} from '../redis/voice-cache.js';

/**
 * Message classification type
 */
export type MessageClassification = 'phatic' | 'substantive';

/**
 * Workflow state interface - single flattened definition
 * All node functions use this same state type
 */
export interface WorkflowState {
  // Base message fields
  messageId: string;
  contactId: string;
  contactName: string;
  content: string;
  timestamp: number;

  // Media fields (Phase 4)
  mediaType?: MediaType;
  mediaBase64?: string;
  mediaMimeType?: string;

  // Transcription result (Phase 4 - voice messages)
  transcribedText?: string;

  // Image for Claude Vision (Phase 4 - image messages)
  imageContent?: ImageContent;

  // Pause control
  isPaused?: boolean;
  pauseReason?: string;

  // Sleep hours control (HTS)
  isSleeping?: boolean;
  sleepWakesUpAt?: number;

  // Classification (from router)
  classification?: MessageClassification;
  classificationLatency?: number;
  classificationTokens?: number;

  // Relationship signal (from router - real-time detection)
  relationshipSignal?: RelationshipSignal;

  // Contact information (from graph node)
  contactInfo?: ContactInfo;
  relationshipType?: string;

  // Graph context (from graph node)
  graphContext?: ContactContext;
  graphQueryLatency?: number;

  // Persona (from graph node)
  persona?: PersonaContext;
  personaCached?: boolean;

  // Style profile (from graph node - per-contact communication patterns)
  styleProfile?: StyleProfile;

  // Conversation history (from graph node - recent messages for context)
  conversationHistory?: ConversationMessage[];
  historyMessageCount?: number;

  // Owner knowledge context (from owner-knowledge skill - personal documents)
  ownerKnowledgeContext?: string;

  // Response generation
  response?: string;
  tokensUsed?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;

  // HTS timing (enhanced)
  typingDelay?: number;
  thinkTime?: number;
  cognitivePause?: number;
  lastMessageTimestamp?: number;

  // Error handling
  error?: string;

  // TTS fields (Phase 5)
  shouldSynthesizeVoice?: boolean;
  audioBase64?: string;
  audioMimeType?: string;
}

// Token usage log for analytics
interface TokenUsageLog {
  messageId: string;
  contactId: string;
  classification: MessageClassification | undefined;
  classificationTokens: number;
  responseTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalLatencyMs: number;
  timestamp: number;
}

/**
 * Check if contact is paused (global or contact-specific)
 */
async function checkPauseNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log(`[Workflow] Checking pause state for ${state.contactId}...`);

  // Check both pause keys in a single round-trip
  const pipeline = redisClient.client.pipeline();
  pipeline.exists('PAUSE:ALL');
  pipeline.exists(`PAUSE:${state.contactId}`);
  const results = await pipeline.exec();

  const globalPause = results?.[0]?.[1] as number;
  const contactPause = results?.[1]?.[1] as number;

  if (globalPause) {
    console.log('[Workflow] Global pause active, skipping message');
    return { isPaused: true, pauseReason: 'global' };
  }

  if (contactPause === 1) {
    console.log(`[Workflow] Contact pause active for ${state.contactId}, skipping message`);
    return { isPaused: true, pauseReason: 'contact' };
  }

  return { isPaused: false };
}

/**
 * Check if we're in sleep hours (HTS feature)
 * If sleeping, queue the message for later processing
 */
async function checkSleepHoursNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log(`[Workflow] Checking sleep hours for ${state.contactId}...`);

  try {
    const sleepStatus = await isSleepHours();

    if (sleepStatus.isSleeping && sleepStatus.wakesUpAt !== undefined) {
      console.log(`[Workflow] Sleep hours active: ${sleepStatus.reason}`);
      console.log(`[Workflow] Message will be queued until ${new Date(sleepStatus.wakesUpAt).toISOString()}`);

      // Queue the message for processing after wake up
      await queueDeferredMessage(
        state.contactId,
        state.messageId,
        state.content,
        sleepStatus.wakesUpAt
      );

      return {
        isSleeping: true,
        sleepWakesUpAt: sleepStatus.wakesUpAt,
      };
    }

    console.log(`[Workflow] Not in sleep hours: ${sleepStatus.reason}`);
    return {
      isSleeping: false,
    };
  } catch (error: any) {
    console.error('[Workflow] Error checking sleep hours:', error);
    // On error, continue processing (fail open for sleep hours)
    return {
      isSleeping: false,
    };
  }
}

/**
 * Process media content (voice transcription, image preparation)
 * Phase 4: Voice & Media Implementation
 */
async function mediaProcessingNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  // Skip if no media or text-only
  if (!state.mediaBase64 || !state.mediaType || state.mediaType === 'text') {
    return {};
  }

  console.log(`[Workflow] Processing ${state.mediaType} media for ${state.contactId}...`);

  // Handle voice messages - transcribe to text
  if (state.mediaType === 'audio') {
    const transcriber = getVoiceTranscriber();

    if (!transcriber.isEnabled()) {
      console.log('[Workflow] Voice transcription disabled, skipping');
      return {
        content: `[Voice message - transcription disabled]\n\nOriginal: ${state.content}`,
      };
    }

    try {
      const result = await transcriber.transcribe(
        state.mediaBase64,
        state.mediaMimeType || 'audio/ogg'
      );

      console.log(
        `[Workflow] Voice transcribed: "${result.text.substring(0, 50)}${result.text.length > 50 ? '...' : ''}" (${result.language || 'unknown'} language)`
      );

      // Replace content with transcription, keeping original as context
      // Also flag for voice response synthesis (Phase 5 TTS)
      return {
        transcribedText: result.text,
        content: `[Voice message transcription]: ${result.text}`,
        shouldSynthesizeVoice: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Workflow] Voice transcription failed: ${errorMsg}`);

      // Continue with original content on failure
      return {
        content: `[Voice message - transcription failed: ${errorMsg}]\n\nOriginal: ${state.content}`,
      };
    }
  }

  // Handle image messages - prepare for Claude Vision
  if (state.mediaType === 'image') {
    const imageEnabled = process.env['IMAGE_PROCESSING_ENABLED'] !== 'false';

    if (!imageEnabled) {
      console.log('[Workflow] Image processing disabled, skipping');
      return {
        content: state.content || '[Image message - processing disabled]',
      };
    }

    // Determine media type for Claude Vision
    const mimeType = state.mediaMimeType?.split(';')[0] || 'image/jpeg';

    // Validate supported image types
    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!supportedTypes.includes(mimeType)) {
      console.warn(`[Workflow] Unsupported image type: ${mimeType}, converting to jpeg`);
    }

    const imageMediaType = supportedTypes.includes(mimeType)
      ? (mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
      : 'image/jpeg';

    console.log(`[Workflow] Image prepared for Claude Vision (${imageMediaType})`);

    return {
      imageContent: {
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType,
          data: state.mediaBase64,
        },
      },
      // Keep caption if exists, otherwise use placeholder
      content: state.content || '[Image message]',
    };
  }

  // Video and document are not yet supported for processing
  if (state.mediaType === 'video') {
    console.log('[Workflow] Video processing not yet implemented');
    return {
      content: state.content || '[Video message - not yet supported]',
    };
  }

  if (state.mediaType === 'document') {
    console.log('[Workflow] Document processing not yet implemented');
    return {
      content: state.content || '[Document message - not yet supported]',
    };
  }

  return {};
}

/**
 * Get and store last message timestamp for cognitive pause calculation
 */
async function getLastMessageTimestamp(contactId: string): Promise<number | null> {
  const key = `HTS:lastMessage:${contactId}`;
  const timestamp = await redisClient.client.get(key);
  return timestamp ? parseInt(timestamp, 10) : null;
}

/**
 * Store last message timestamp for cognitive pause calculation
 */
async function setLastMessageTimestamp(contactId: string): Promise<void> {
  const key = `HTS:lastMessage:${contactId}`;
  await redisClient.client.setex(key, 3600, Date.now().toString()); // Expire after 1 hour
}

/**
 * Generate response for PHATIC messages using Haiku
 * Fast path - no context retrieval needed
 */
async function phaticResponseNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log(`[Workflow] Generating phatic response for ${state.contactId}...`);

  const startTime = Date.now();

  try {
    // Use default casual persona for phatic messages
    const simplePersona = state.persona?.styleGuide ||
      'Keep responses very brief and natural. Match the energy of simple acknowledgments.';

    // Call Haiku for quick response
    const result = await haikuClient.getSimpleResponse(state.content, simplePersona);

    const latency = Date.now() - startTime;
    console.log(`[Workflow] Phatic response generated in ${latency}ms (${result.tokensUsed} tokens)`);

    // Calculate enhanced typing delay with HTS
    const htsDelay = await calculateEnhancedTypingDelay(result.response, state.contactId);

    // Log token usage
    await logTokenUsage({
      messageId: state.messageId,
      contactId: state.contactId,
      classification: 'phatic',
      classificationTokens: state.classificationTokens || 0,
      responseTokens: result.tokensUsed,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalLatencyMs: latency + (state.classificationLatency || 0),
      timestamp: Date.now(),
    });

    return {
      response: result.response,
      tokensUsed: result.tokensUsed,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      typingDelay: htsDelay.totalDelay,
      thinkTime: htsDelay.thinkTime,
      cognitivePause: htsDelay.cognitivePause,
    };
  } catch (error: any) {
    console.error('[Workflow] Error generating phatic response:', error);
    return {
      error: error.message || 'Failed to generate phatic response',
    };
  }
}

/**
 * Generate response for SUBSTANTIVE messages using Sonnet with context
 * Full path - uses persona and graph context
 */
async function substantiveResponseNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log(`[Workflow] Generating substantive response for ${state.contactId}...`);

  const startTime = Date.now();

  try {
    // Get persona (should be set by graphAndPersonaNode)
    const persona: PersonaContext = state.persona || {
      id: 'fallback',
      name: 'Default',
      styleGuide: 'Keep responses brief and natural.',
      tone: 'casual',
      exampleMessages: [],
      applicableTo: ['acquaintance'],
    };

    // Get graph context (should be set by graphAndPersonaNode)
    const context: ContactContext = state.graphContext || {
      people: [],
      topics: [],
      events: [],
    };

    // Prepare images for Claude Vision (Phase 4)
    const images = state.imageContent ? [state.imageContent] : undefined;

    // Call Sonnet with context, style profile, conversation history, images, and owner knowledge
    const result = await sonnetClient.getContextualResponse(
      state.content,
      persona.styleGuide,
      {
        people: context.people,
        topics: context.topics,
      },
      state.styleProfile, // Pass contact-specific style profile
      state.conversationHistory, // Pass conversation history for multi-turn context
      images, // Pass images for Claude Vision (Phase 4)
      state.ownerKnowledgeContext // Pass owner knowledge from uploaded documents (Phase 7)
    );

    const latency = Date.now() - startTime;
    const historyCount = state.historyMessageCount ?? 0;
    console.log(
      `[Workflow] Substantive response generated in ${latency}ms (${result.tokensUsed} tokens, cache read: ${result.cacheReadTokens}, cache write: ${result.cacheWriteTokens}, history: ${historyCount} msgs)`
    );

    // Calculate enhanced typing delay with HTS
    const htsDelay = await calculateEnhancedTypingDelay(result.response, state.contactId);

    // Log token usage
    await logTokenUsage({
      messageId: state.messageId,
      contactId: state.contactId,
      classification: 'substantive',
      classificationTokens: state.classificationTokens || 0,
      responseTokens: result.tokensUsed,
      cacheReadTokens: result.cacheReadTokens,
      cacheWriteTokens: result.cacheWriteTokens,
      totalLatencyMs: latency + (state.classificationLatency || 0) + (state.graphQueryLatency || 0),
      timestamp: Date.now(),
    });

    return {
      response: result.response,
      tokensUsed: result.tokensUsed,
      cacheReadTokens: result.cacheReadTokens,
      cacheWriteTokens: result.cacheWriteTokens,
      typingDelay: htsDelay.totalDelay,
      thinkTime: htsDelay.thinkTime,
      cognitivePause: htsDelay.cognitivePause,
    };
  } catch (error: any) {
    console.error('[Workflow] Error generating substantive response:', error);
    return {
      error: error.message || 'Failed to generate substantive response',
    };
  }
}

/**
 * Calculate typing delay using enhanced HTS module
 * Returns the full delay result with breakdown for logging
 */
async function calculateEnhancedTypingDelay(
  text: string,
  contactId: string
): Promise<{
  totalDelay: number;
  thinkTime: number;
  cognitivePause: number;
  breakdown: string;
}> {
  // Calculate base typing delay
  const delayResult = calculateHTSTypingDelay(text);

  // Calculate cognitive pause based on last message time
  const lastMessageTime = await getLastMessageTimestamp(contactId);
  const cognitivePause = lastMessageTime
    ? calculateCognitivePause(lastMessageTime)
    : 0;

  // Update last message timestamp for next message
  await setLastMessageTimestamp(contactId);

  const totalDelay = delayResult.totalDelayMs + cognitivePause;
  const breakdown = formatTypingDelay(delayResult) + (cognitivePause > 0 ? ` + ${cognitivePause}ms cognitive pause` : '');

  console.log(`[Workflow] HTS delay calculated: ${breakdown}`);

  return {
    totalDelay,
    thinkTime: delayResult.thinkTimeMs,
    cognitivePause,
    breakdown,
  };
}

/**
 * Get voice preference for a contact
 * Uses cache-first pattern with fallback to default settings
 */
async function getContactVoicePreference(contactId: string): Promise<VoicePreference> {
  const preference = await getVoicePreferenceWithCache(contactId, async () => {
    // In future, this could load from AutoMem contact metadata
    // For now, return null to use default
    return null;
  });

  return preference || getDefaultVoicePreference();
}

/**
 * Synthesize voice response using ElevenLabs TTS
 * Phase 5: Only synthesizes when incoming message was a voice message
 * Task 4.1.2: Supports per-contact voice preferences
 */
async function voiceSynthesisNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  // Skip if no response or synthesis not needed
  if (!state.response || !state.shouldSynthesizeVoice) {
    return {};
  }

  // Get per-contact voice preference
  const voicePreference = await getContactVoicePreference(state.contactId);

  // Check if voice output is disabled for this contact
  if (!voicePreference.enabled) {
    console.log(`[Workflow] Voice output disabled for contact ${state.contactId}, skipping`);
    return {};
  }

  const synthesizer = getVoiceSynthesizer();
  if (!synthesizer.isEnabled()) {
    console.log('[Workflow] Voice synthesis disabled globally, skipping');
    return {};
  }

  const startTime = Date.now();

  try {
    // Build options object with only defined values (for exactOptionalPropertyTypes)
    const options: {
      voiceId?: string;
      modelId?: string;
      maxCharacters?: number;
    } = {};
    if (voicePreference.voiceId) options.voiceId = voicePreference.voiceId;
    if (voicePreference.modelId) options.modelId = voicePreference.modelId;
    if (voicePreference.maxCharacters) options.maxCharacters = voicePreference.maxCharacters;

    // Use per-contact voice settings if available
    const result = await synthesizer.synthesize(state.response, options);
    const latencyMs = Date.now() - startTime;

    console.log(
      `[Workflow] Voice synthesized for ${state.contactId}: ${result.sizeBytes} bytes in ${latencyMs}ms`
    );

    // Record TTS metrics
    await metricsCollector.recordVoiceSynthesis(result.sizeBytes, latencyMs);

    return {
      audioBase64: result.base64,
      audioMimeType: result.mimeType,
    };
  } catch (error) {
    console.error('[Workflow] Voice synthesis failed:', error);
    // Graceful fallback to text response
    return {};
  }
}

/**
 * Queue response to Gateway for sending
 * T093: Includes enhanced HTS timing data
 */
async function queueResponseNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  if (!state.response) {
    console.error('[Workflow] No response to queue');
    return {};
  }

  console.log(`[Workflow] Queueing response for ${state.contactId}...`);

  try {
    // Add response to Redis stream for Gateway to consume
    // Include HTS timing data for enhanced typing simulation
    // Include TTS audio fields if voice synthesis was performed (Phase 5)
    const responsePayload = JSON.stringify({
      contactId: state.contactId,
      content: state.response,
      timestamp: Date.now(),
      typingDelay: state.typingDelay || 2000,
      thinkTime: state.thinkTime || 0,
      cognitivePause: state.cognitivePause || 0,
      classification: state.classification,
      tokensUsed: state.tokensUsed,
      // TTS audio fields (Phase 5) - only include if present
      ...(state.audioBase64 && { audioBase64: state.audioBase64 }),
      ...(state.audioMimeType && { audioMimeType: state.audioMimeType }),
    });

    await redisClient.client.xadd('QUEUE:responses', '*', 'payload', responsePayload);

    console.log(`[Workflow] Response queued successfully for ${state.contactId}`);

    return {};
  } catch (error: any) {
    console.error('[Workflow] Error queueing response:', error);
    return {
      error: error.message || 'Failed to queue response',
    };
  }
}

/**
 * Log token usage to Redis for analytics
 */
async function logTokenUsage(log: TokenUsageLog): Promise<void> {
  try {
    const key = 'LOGS:token_usage';
    const member = JSON.stringify(log);
    const dateKey = new Date().toISOString().split('T')[0];
    const statsKey = `STATS:tokens:${dateKey}`;
    const thirtyDays = 30 * 24 * 60 * 60;

    // Pipeline all writes in a single round-trip
    const pipeline = redisClient.client.pipeline();
    pipeline.zadd(key, log.timestamp, member);
    // Trim sorted set to last 10,000 entries to prevent unbounded growth
    pipeline.zremrangebyrank(key, 0, -10001);
    pipeline.hincrby(statsKey, 'classification', log.classificationTokens);
    pipeline.hincrby(statsKey, 'response', log.responseTokens);
    pipeline.hincrby(statsKey, 'cache_read', log.cacheReadTokens);
    pipeline.hincrby(statsKey, 'cache_write', log.cacheWriteTokens);
    pipeline.hincrby(statsKey, 'total_messages', 1);
    pipeline.expire(statsKey, thirtyDays);
    await pipeline.exec();

  } catch (error) {
    console.error('[Workflow] Error logging token usage:', error);
    // Don't fail the workflow for logging errors
  }
}

/**
 * Routing logic - determines next node after pause check
 */
function shouldContinueAfterPause(state: WorkflowState): string {
  if (state.isPaused) {
    return END;
  }
  if (state.error) {
    return END;
  }
  return 'check_sleep_hours';
}

/**
 * Routing logic - determines next node based on classification
 */
function routeByMessageType(state: WorkflowState): string {
  if (state.error) {
    return END;
  }

  if (state.classification === 'phatic') {
    return 'phatic_response';
  }

  // Substantive messages need context retrieval first
  return 'graph_query';
}

/**
 * Routing logic - after graph query, generate response
 */
function afterGraphQuery(state: WorkflowState): string {
  if (state.error) {
    return END;
  }
  return 'substantive_response';
}

/**
 * Routing logic - after response generation, proceed to voice synthesis
 */
function shouldSynthesizeVoice(state: WorkflowState): string {
  if (state.error || !state.response) {
    return END;
  }
  return 'voice_synthesis';
}

/**
 * Routing logic - after voice synthesis, queue the response
 */
function afterVoiceSynthesis(state: WorkflowState): string {
  if (state.error) {
    return END;
  }
  return 'queue_response';
}

/**
 * State annotation for LangGraph workflow
 */
const WorkflowStateAnnotation = Annotation.Root({
  // Base message fields
  messageId: Annotation<string>,
  contactId: Annotation<string>,
  contactName: Annotation<string>,
  content: Annotation<string>,
  timestamp: Annotation<number>,
  // Media fields (Phase 4)
  mediaType: Annotation<MediaType | undefined>,
  mediaBase64: Annotation<string | undefined>,
  mediaMimeType: Annotation<string | undefined>,
  transcribedText: Annotation<string | undefined>,
  imageContent: Annotation<ImageContent | undefined>,
  // Pause control
  isPaused: Annotation<boolean | undefined>,
  pauseReason: Annotation<string | undefined>,
  // Sleep hours control (HTS)
  isSleeping: Annotation<boolean | undefined>,
  sleepWakesUpAt: Annotation<number | undefined>,
  // Classification
  classification: Annotation<MessageClassification | undefined>,
  classificationLatency: Annotation<number | undefined>,
  classificationTokens: Annotation<number | undefined>,
  // Relationship signal (from router - real-time detection)
  relationshipSignal: Annotation<RelationshipSignal | undefined>,
  // Graph context
  contactInfo: Annotation<ContactInfo | undefined>,
  relationshipType: Annotation<string | undefined>,
  graphContext: Annotation<ContactContext | undefined>,
  graphQueryLatency: Annotation<number | undefined>,
  // Persona
  persona: Annotation<PersonaContext | undefined>,
  personaCached: Annotation<boolean | undefined>,
  // Style profile
  styleProfile: Annotation<StyleProfile | undefined>,
  // Conversation history
  conversationHistory: Annotation<ConversationMessage[] | undefined>,
  historyMessageCount: Annotation<number | undefined>,
  // Response
  response: Annotation<string | undefined>,
  tokensUsed: Annotation<number | undefined>,
  cacheReadTokens: Annotation<number | undefined>,
  cacheWriteTokens: Annotation<number | undefined>,
  // HTS timing (enhanced)
  typingDelay: Annotation<number | undefined>,
  thinkTime: Annotation<number | undefined>,
  cognitivePause: Annotation<number | undefined>,
  lastMessageTimestamp: Annotation<number | undefined>,
  // Error
  error: Annotation<string | undefined>,
  // TTS fields (Phase 5)
  shouldSynthesizeVoice: Annotation<boolean | undefined>,
  audioBase64: Annotation<string | undefined>,
  audioMimeType: Annotation<string | undefined>,
});

/**
 * Routing logic - after sleep check, process media before routing
 */
function shouldContinueAfterSleepCheckToMedia(state: WorkflowState): string {
  if (state.isSleeping) {
    // Message has been queued for later, stop processing
    return END;
  }
  if (state.error) {
    return END;
  }
  return 'media_processing';
}

/**
 * Routing logic - after media processing, continue to router
 */
function afterMediaProcessing(state: WorkflowState): string {
  if (state.error) {
    return END;
  }
  return 'router';
}

/**
 * Build and compile the workflow graph
 * User Story 2 & 3 workflow with HTS and Media Processing:
 *
 * check_pause -> check_sleep_hours -> media_processing -> router -> [phatic_response | graph_query -> substantive_response] -> queue_response
 */
export function buildWorkflow() {
  // Use type assertion to work around strict StateGraph typing
  // The runtime behavior is correct; this is just a TypeScript limitation with the Annotation API
  const workflow = new StateGraph(WorkflowStateAnnotation) as any;

  // Add nodes
  workflow.addNode('check_pause', checkPauseNode);
  workflow.addNode('check_sleep_hours', checkSleepHoursNode);
  workflow.addNode('media_processing', mediaProcessingNode); // Phase 4: Media processing
  workflow.addNode('router', routerNode);
  workflow.addNode('phatic_response', phaticResponseNode);
  workflow.addNode('graph_query', contextRetrievalNode);
  workflow.addNode('substantive_response', substantiveResponseNode);
  workflow.addNode('voice_synthesis', voiceSynthesisNode); // Phase 5: TTS
  workflow.addNode('queue_response', queueResponseNode);

  // Set entry point
  workflow.addEdge('__start__', 'check_pause');

  // Add conditional edges
  workflow.addConditionalEdges('check_pause', shouldContinueAfterPause, {
    check_sleep_hours: 'check_sleep_hours',
    [END]: END,
  });

  workflow.addConditionalEdges('check_sleep_hours', shouldContinueAfterSleepCheckToMedia, {
    media_processing: 'media_processing',
    [END]: END,
  });

  workflow.addConditionalEdges('media_processing', afterMediaProcessing, {
    router: 'router',
    [END]: END,
  });

  workflow.addConditionalEdges('router', routeByMessageType, {
    phatic_response: 'phatic_response',
    graph_query: 'graph_query',
    [END]: END,
  });

  workflow.addConditionalEdges('phatic_response', shouldSynthesizeVoice, {
    voice_synthesis: 'voice_synthesis',
    [END]: END,
  });

  workflow.addConditionalEdges('graph_query', afterGraphQuery, {
    substantive_response: 'substantive_response',
    [END]: END,
  });

  workflow.addConditionalEdges('substantive_response', shouldSynthesizeVoice, {
    voice_synthesis: 'voice_synthesis',
    [END]: END,
  });

  workflow.addConditionalEdges('voice_synthesis', afterVoiceSynthesis, {
    queue_response: 'queue_response',
    [END]: END,
  });

  workflow.addEdge('queue_response', END);

  // Compile the graph
  return workflow.compile();
}

// Legacy function for backward compatibility
export function buildSimpleWorkflow() {
  return buildWorkflow();
}
