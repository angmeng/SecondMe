/**
 * Orchestrator Service - AI Workflow and Message Processing
 * Entry point for LangGraph workflows, Claude AI integration, and response generation
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

import express, { Request, Response } from 'express';
import { redisClient } from './redis/client.js';
import { automemClient } from './automem/client.js';
import { buildWorkflow } from './langgraph/workflow.js';
import { metricsCollector } from './metrics/collector.js';
import { getReadyDeferredMessages } from './hts/index.js';
import { skillRegistry, registerBuiltInSkills } from './skills/index.js';
import { createLogger } from './utils/logger.js';

const PORT = process.env['ORCHESTRATOR_PORT'] || 3002;
const NODE_ENV = process.env['NODE_ENV'] || 'development';

// Express app for health endpoint
const app = express();

// Initialize workflow
const workflow = buildWorkflow();

/**
 * Deferred message processor - processes messages that were queued during sleep hours
 */
async function startDeferredMessageProcessor() {
  console.log('[Orchestrator] Starting deferred message processor...');

  while (true) {
    try {
      // Check for deferred messages every minute
      await new Promise((resolve) => setTimeout(resolve, 60000));

      const readyMessages = await getReadyDeferredMessages();

      if (readyMessages.length > 0) {
        console.log(`[Orchestrator] Processing ${readyMessages.length} deferred message(s)...`);

        for (const msg of readyMessages) {
          try {
            // Re-queue the message for normal processing
            const payload = JSON.stringify({
              messageId: msg.messageId,
              contactId: msg.contactId,
              contactName: 'Unknown', // Could be enhanced to retrieve from cache
              content: msg.content,
              timestamp: Date.now(),
            });

            await redisClient.client.xadd('QUEUE:messages', '*', 'payload', payload);
            console.log(`[Orchestrator] Re-queued deferred message from ${msg.contactId}`);
          } catch (error) {
            console.error('[Orchestrator] Error re-queueing deferred message:', error);
          }
        }
      }
    } catch (error) {
      console.error('[Orchestrator] Error in deferred message processor:', error);
    }
  }
}

/**
 * Message consumer loop - consumes messages from Gateway and processes them
 */
async function startMessageConsumer() {
  let lastId = '$'; // Start from latest messages

  console.log('[Orchestrator] Starting message consumer...');

  while (true) {
    try {
      const messages = await redisClient.consumeMessages('QUEUE:messages', lastId);

      if (messages.length > 0) {
        console.log(`[Orchestrator] Processing ${messages.length} message(s)...`);

        for (const message of messages) {
          try {
            // Parse message payload
            const payloadStr = message.fields['payload'];
            if (!payloadStr) {
              console.warn(`[Orchestrator] Skipping message ${message.id}: missing payload`);
              continue;
            }
            const payload = JSON.parse(payloadStr);

            console.log(
              `[Orchestrator] Processing message from ${payload.contactId}: ${payload.content}`
            );

            // Build initial workflow state
            const initialState = {
              messageId: payload.messageId,
              contactId: payload.contactId,
              contactName: payload.contactName,
              content: payload.content,
              timestamp: payload.timestamp,
            };

            // Execute workflow
            const result = await workflow.invoke(initialState);

            console.log(
              `[Orchestrator] Workflow completed for ${payload.contactId}:`,
              result['isPaused'] ? `Paused (${result['pauseReason']})` : 'Response generated'
            );

            // Delete message from queue after processing
            await redisClient.deleteMessage('QUEUE:messages', message.id);

            // Update lastId for next iteration
            lastId = message.id;
          } catch (error) {
            console.error(`[Orchestrator] Error processing message ${message.id}:`, error);
            // Continue processing other messages
          }
        }
      } else {
        // No messages, reset to wait for new ones
        lastId = '$';
      }
    } catch (error) {
      console.error('[Orchestrator] Error in message consumer:', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function startOrchestratorService() {
  try {
    console.log('[Orchestrator] Starting Orchestrator Service...');
    console.log(`[Orchestrator] Environment: ${NODE_ENV}`);

    // Initialize Redis connection
    console.log('[Orchestrator] Connecting to Redis...');
    await redisClient.connect();
    console.log('[Orchestrator] Redis connected');

    // Initialize AutoMem connection
    console.log('[Orchestrator] Connecting to AutoMem...');
    await automemClient.connect();
    console.log('[Orchestrator] AutoMem connected');

    // Verify Anthropic API key
    if (!process.env['ANTHROPIC_API_KEY']) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    console.log('[Orchestrator] Anthropic API key verified');

    // Initialize skill registry
    console.log('[Orchestrator] Initializing skill registry...');
    const skillLogger = createLogger('Skills');
    await skillRegistry.initialize(redisClient.client, {
      info: (msg, meta) => skillLogger.info(msg, meta),
      warn: (msg, meta) => skillLogger.warn(msg, meta),
      error: (msg, meta) => skillLogger.error(msg, meta),
      debug: (msg, meta) => skillLogger.debug(msg, meta),
    });

    // Register built-in skills
    await registerBuiltInSkills();

    // Load persisted state (enabled/disabled, configs)
    await skillRegistry.loadState();
    console.log(`[Orchestrator] Skill registry initialized with ${skillRegistry.listSkills().length} skills`);

    console.log('[Orchestrator] Workflow initialized');

    // Start metrics publishing
    metricsCollector.startPublishing(30000);
    console.log('[Orchestrator] Metrics publishing started');

    // Health endpoint (T113)
    app.get('/health', async (_req: Request, res: Response) => {
      try {
        const health = await metricsCollector.getHealthStatus();
        res.status(health.status === 'healthy' ? 200 : 503).json({
          status: health.status,
          service: 'orchestrator',
          checks: health.checks,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          service: 'orchestrator',
          error: error instanceof Error ? error.message : 'Health check failed',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Skills API endpoints
    app.get('/skills', (_req: Request, res: Response) => {
      try {
        const skills = skillRegistry.listSkills();
        res.json({ success: true, skills, count: skills.length });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list skills',
        });
      }
    });

    app.get('/skills/:skillId', (req: Request, res: Response) => {
      try {
        const skillId = req.params['skillId'];
        if (typeof skillId !== 'string') {
          res.status(400).json({ success: false, error: 'Invalid skill ID' });
          return;
        }
        const skill = skillRegistry.getSkill(skillId);
        if (!skill) {
          res.status(404).json({ success: false, error: `Skill ${skillId} not found` });
          return;
        }
        res.json({ success: true, skill });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get skill',
        });
      }
    });

    app.post('/skills/:skillId/enable', async (req: Request, res: Response) => {
      try {
        const skillId = req.params['skillId'];
        if (typeof skillId !== 'string') {
          res.status(400).json({ success: false, error: 'Invalid skill ID' });
          return;
        }
        const skill = skillRegistry.getSkill(skillId);
        if (!skill) {
          res.status(404).json({ success: false, error: `Skill ${skillId} not found` });
          return;
        }
        await skillRegistry.enable(skillId);
        res.json({ success: true, message: `Skill ${skillId} enabled` });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to enable skill',
        });
      }
    });

    app.post('/skills/:skillId/disable', async (req: Request, res: Response) => {
      try {
        const skillId = req.params['skillId'];
        if (typeof skillId !== 'string') {
          res.status(400).json({ success: false, error: 'Invalid skill ID' });
          return;
        }
        const skill = skillRegistry.getSkill(skillId);
        if (!skill) {
          res.status(404).json({ success: false, error: `Skill ${skillId} not found` });
          return;
        }
        await skillRegistry.disable(skillId);
        res.json({ success: true, message: `Skill ${skillId} disabled` });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to disable skill',
        });
      }
    });

    app.put('/skills/:skillId/config', async (req: Request, res: Response) => {
      try {
        const skillId = req.params['skillId'];
        if (typeof skillId !== 'string') {
          res.status(400).json({ success: false, error: 'Invalid skill ID' });
          return;
        }
        const skill = skillRegistry.getSkill(skillId);
        if (!skill) {
          res.status(404).json({ success: false, error: `Skill ${skillId} not found` });
          return;
        }
        const { config } = req.body;
        if (!config || typeof config !== 'object') {
          res.status(400).json({ success: false, error: 'Invalid config object' });
          return;
        }
        await skillRegistry.updateConfig(skillId, config);
        const updatedConfig = skillRegistry.getConfig(skillId);
        res.json({ success: true, message: `Skill ${skillId} config updated`, config: updatedConfig });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update skill config',
        });
      }
    });

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`[Orchestrator] HTTP server listening on port ${PORT}`);
    });

    // Start message consumer in background
    startMessageConsumer().catch((error) => {
      console.error('[Orchestrator] Message consumer crashed:', error);
    });

    // Start deferred message processor (for sleep hours feature)
    startDeferredMessageProcessor().catch((error) => {
      console.error('[Orchestrator] Deferred message processor crashed:', error);
    });

    console.log(`[Orchestrator] Orchestrator service ready on port ${PORT}`);
  } catch (error) {
    console.error('[Orchestrator] Failed to start Orchestrator service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('[Orchestrator] Shutting down gracefully...');

  try {
    // Stop metrics publishing
    metricsCollector.stopPublishing();

    await redisClient.quit();
    await automemClient.quit();
    console.log('[Orchestrator] Orchestrator service shut down');
    process.exit(0);
  } catch (error) {
    console.error('[Orchestrator] Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the service
startOrchestratorService();
