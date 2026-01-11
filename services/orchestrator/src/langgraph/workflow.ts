/**
 * LangGraph Workflow for Message Processing
 * User Story 1: Basic message routing with pause control
 */

import { StateGraph, END } from '@langchain/langgraph';
import { sonnetClient } from '../anthropic/sonnet-client.js';
import { redisClient } from '../redis/client.js';

/**
 * Workflow state interface
 */
export interface WorkflowState {
  messageId: string;
  contactId: string;
  contactName: string;
  content: string;
  timestamp: number;

  // Pause control
  isPaused?: boolean;
  pauseReason?: string;

  // Response generation
  response?: string;
  tokensUsed?: number;

  // HTS timing
  typingDelay?: number;

  // Error handling
  error?: string;
}

/**
 * Check if contact is paused (global or contact-specific)
 */
async function checkPauseNode(state: WorkflowState): Partial<WorkflowState> {
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
 * Generate simple response using Sonnet
 * For User Story 1: Basic replies without persona or context
 */
async function generateResponseNode(state: WorkflowState): Partial<WorkflowState> {
  console.log(`[Workflow] Generating response for message from ${state.contactId}...`);

  try {
    // Simple persona for MVP - will be replaced in User Story 2
    const simplePersona = `You are a friendly assistant. Keep responses brief and natural for WhatsApp chat.`;

    // Call Sonnet with basic prompt
    const result = await sonnetClient.getSimpleResponse(state.content, simplePersona);

    console.log(
      `[Workflow] Response generated: ${result.tokensUsed} tokens (cache read: ${result.cacheReadTokens})`
    );

    // Calculate typing delay based on response length (HTS)
    const typingDelay = calculateTypingDelay(result.response);

    return {
      response: result.response,
      tokensUsed: result.tokensUsed,
      typingDelay,
    };
  } catch (error: any) {
    console.error('[Workflow] Error generating response:', error);
    return {
      error: error.message || 'Failed to generate response',
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
async function queueResponseNode(state: WorkflowState): Partial<WorkflowState> {
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
 * Routing logic - determines next node based on state
 */
function shouldContinue(state: WorkflowState): string {
  // If paused, end workflow
  if (state.isPaused) {
    return END;
  }

  // If error occurred, end workflow
  if (state.error) {
    return END;
  }

  // Continue to response generation
  return 'generate_response';
}

function shouldQueueResponse(state: WorkflowState): string {
  // If error or no response, end workflow
  if (state.error || !state.response) {
    return END;
  }

  // Queue response
  return 'queue_response';
}

/**
 * Build and compile the workflow graph
 */
export function buildWorkflow() {
  const workflow = new StateGraph<WorkflowState>({
    channels: {
      messageId: null,
      contactId: null,
      contactName: null,
      content: null,
      timestamp: null,
      isPaused: null,
      pauseReason: null,
      response: null,
      tokensUsed: null,
      typingDelay: null,
      error: null,
    },
  });

  // Add nodes
  workflow.addNode('check_pause', checkPauseNode);
  workflow.addNode('generate_response', generateResponseNode);
  workflow.addNode('queue_response', queueResponseNode);

  // Set entry point
  workflow.setEntryPoint('check_pause');

  // Add conditional edges
  workflow.addConditionalEdges('check_pause', shouldContinue, {
    generate_response: 'generate_response',
    [END]: END,
  });

  workflow.addConditionalEdges('generate_response', shouldQueueResponse, {
    queue_response: 'queue_response',
    [END]: END,
  });

  workflow.addEdge('queue_response', END);

  // Compile the graph
  return workflow.compile();
}
