/**
 * LangGraph Workflow for Message Processing
 * User Story 2: Enhanced workflow with persona-based responses and knowledge graph context
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { sonnetClient } from '../anthropic/sonnet-client.js';
import { haikuClient } from '../anthropic/haiku-client.js';
import { redisClient } from '../redis/client.js';
import { routerNode } from './router-node.js';
import { graphAndPersonaNode } from './graph-node.js';
import { ContactContext, PersonaContext, ContactInfo } from '../falkordb/queries.js';

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

  // Pause control
  isPaused?: boolean;
  pauseReason?: string;

  // Classification (from router)
  classification?: MessageClassification;
  classificationLatency?: number;
  classificationTokens?: number;

  // Contact information (from graph node)
  contactInfo?: ContactInfo;
  relationshipType?: string;

  // Graph context (from graph node)
  graphContext?: ContactContext;
  graphQueryLatency?: number;

  // Persona (from graph node)
  persona?: PersonaContext;
  personaCached?: boolean;

  // Response generation
  response?: string;
  tokensUsed?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;

  // HTS timing
  typingDelay?: number;

  // Error handling
  error?: string;
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

  // Check global pause
  const globalPause = await redisClient.client.exists('PAUSE:ALL');
  if (globalPause) {
    console.log('[Workflow] Global pause active, skipping message');
    return {
      isPaused: true,
      pauseReason: 'global',
    };
  }

  // Check contact-specific pause
  const contactPause = await redisClient.client.get(`PAUSE:${state.contactId}`);
  if (contactPause) {
    const expiresAt = parseInt(contactPause, 10);
    if (Date.now() < expiresAt) {
      console.log(`[Workflow] Contact pause active for ${state.contactId}, skipping message`);
      return {
        isPaused: true,
        pauseReason: 'contact',
      };
    }
  }

  return {
    isPaused: false,
  };
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

    // Calculate typing delay
    const typingDelay = calculateTypingDelay(result.response);

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
      typingDelay,
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

    // Call Sonnet with context
    const result = await sonnetClient.getContextualResponse(state.content, persona.styleGuide, {
      people: context.people,
      topics: context.topics,
    });

    const latency = Date.now() - startTime;
    console.log(
      `[Workflow] Substantive response generated in ${latency}ms (${result.tokensUsed} tokens, cache read: ${result.cacheReadTokens}, cache write: ${result.cacheWriteTokens})`
    );

    // Calculate typing delay
    const typingDelay = calculateTypingDelay(result.response);

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
      typingDelay,
    };
  } catch (error: any) {
    console.error('[Workflow] Error generating substantive response:', error);
    return {
      error: error.message || 'Failed to generate substantive response',
    };
  }
}

/**
 * Calculate typing delay for HTS (Human Typing Simulation)
 * Formula: 30ms base + (2ms per character) + random jitter
 */
function calculateTypingDelay(text: string): number {
  const baseDelay = 30;
  const charDelay = text.length * 2;
  const jitter = Math.random() * 500;

  const totalDelay = baseDelay + charDelay + jitter;

  // Cap at 5 seconds
  return Math.min(totalDelay, 5000);
}

/**
 * Queue response to Gateway for sending
 */
async function queueResponseNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  if (!state.response) {
    console.error('[Workflow] No response to queue');
    return {};
  }

  console.log(`[Workflow] Queueing response for ${state.contactId}...`);

  try {
    // Add response to Redis stream for Gateway to consume
    const responsePayload = JSON.stringify({
      contactId: state.contactId,
      content: state.response,
      timestamp: Date.now(),
      typingDelay: state.typingDelay || 2000,
      classification: state.classification,
      tokensUsed: state.tokensUsed,
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
    // Store in Redis sorted set by timestamp for easy retrieval
    const key = 'LOGS:token_usage';
    const member = JSON.stringify(log);
    await redisClient.client.zadd(key, log.timestamp, member);

    // Also increment daily counters
    const dateKey = new Date().toISOString().split('T')[0];
    await redisClient.client.hincrby(`STATS:tokens:${dateKey}`, 'classification', log.classificationTokens);
    await redisClient.client.hincrby(`STATS:tokens:${dateKey}`, 'response', log.responseTokens);
    await redisClient.client.hincrby(`STATS:tokens:${dateKey}`, 'cache_read', log.cacheReadTokens);
    await redisClient.client.hincrby(`STATS:tokens:${dateKey}`, 'cache_write', log.cacheWriteTokens);
    await redisClient.client.hincrby(`STATS:tokens:${dateKey}`, 'total_messages', 1);

    // Set expiry on daily stats (30 days)
    await redisClient.client.expire(`STATS:tokens:${dateKey}`, 30 * 24 * 60 * 60);

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
  return 'router';
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
 * Routing logic - after response generation, queue it
 */
function shouldQueueResponse(state: WorkflowState): string {
  if (state.error || !state.response) {
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
  // Pause control
  isPaused: Annotation<boolean | undefined>,
  pauseReason: Annotation<string | undefined>,
  // Classification
  classification: Annotation<MessageClassification | undefined>,
  classificationLatency: Annotation<number | undefined>,
  classificationTokens: Annotation<number | undefined>,
  // Graph context
  contactInfo: Annotation<ContactInfo | undefined>,
  relationshipType: Annotation<string | undefined>,
  graphContext: Annotation<ContactContext | undefined>,
  graphQueryLatency: Annotation<number | undefined>,
  // Persona
  persona: Annotation<PersonaContext | undefined>,
  personaCached: Annotation<boolean | undefined>,
  // Response
  response: Annotation<string | undefined>,
  tokensUsed: Annotation<number | undefined>,
  cacheReadTokens: Annotation<number | undefined>,
  cacheWriteTokens: Annotation<number | undefined>,
  typingDelay: Annotation<number | undefined>,
  // Error
  error: Annotation<string | undefined>,
});

/**
 * Build and compile the workflow graph
 * User Story 2 workflow:
 *
 * check_pause -> router -> [phatic_response | graph_query -> substantive_response] -> queue_response
 */
export function buildWorkflow() {
  // Use type assertion to work around strict StateGraph typing
  // The runtime behavior is correct; this is just a TypeScript limitation with the Annotation API
  const workflow = new StateGraph(WorkflowStateAnnotation) as any;

  // Add nodes
  workflow.addNode('check_pause', checkPauseNode);
  workflow.addNode('router', routerNode);
  workflow.addNode('phatic_response', phaticResponseNode);
  workflow.addNode('graph_query', graphAndPersonaNode);
  workflow.addNode('substantive_response', substantiveResponseNode);
  workflow.addNode('queue_response', queueResponseNode);

  // Set entry point
  workflow.addEdge('__start__', 'check_pause');

  // Add conditional edges
  workflow.addConditionalEdges('check_pause', shouldContinueAfterPause, {
    router: 'router',
    [END]: END,
  });

  workflow.addConditionalEdges('router', routeByMessageType, {
    phatic_response: 'phatic_response',
    graph_query: 'graph_query',
    [END]: END,
  });

  workflow.addConditionalEdges('phatic_response', shouldQueueResponse, {
    queue_response: 'queue_response',
    [END]: END,
  });

  workflow.addConditionalEdges('graph_query', afterGraphQuery, {
    substantive_response: 'substantive_response',
    [END]: END,
  });

  workflow.addConditionalEdges('substantive_response', shouldQueueResponse, {
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
