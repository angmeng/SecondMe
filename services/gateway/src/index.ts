/**
 * Gateway Service - WhatsApp Web.js Integration
 * Entry point for WhatsApp connectivity and message routing
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

import { Server } from 'socket.io';
import { createServer } from 'http';
import { whatsappClient } from './whatsapp/client.js';
import { redisClient } from './redis/client.js';
import { historyStore } from './redis/history-store.js';
import { pairingStore } from './redis/pairing-store.js';
import { MessageSender } from './whatsapp/sender.js';
import { SessionManager } from './whatsapp/session-manager.js';
import { ContactManager } from './whatsapp/contact-manager.js';
import { fetchChatMessages, WhatsAppDisconnectedError } from './whatsapp/message-fetcher.js';
import {
  RateLimiter,
  GatewayMessageProcessor,
  WhatsAppChannel,
  TelegramChannel,
  ChannelManager,
  ChannelRouter,
  type ChannelLogger,
} from './channels/index.js';
import express from 'express';

const PORT = process.env.GATEWAY_PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Express app for health checks and status endpoints
const app = express();
app.use(express.json());

// HTTP server for Socket.io
const httpServer = createServer(app);

// Socket.io server for real-time QR code and event streaming
export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Channel logger adapter for console
const logger: ChannelLogger = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.log(`[Gateway] ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(`[Gateway] ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg: string, meta?: Record<string, unknown>) =>
    console.error(`[Gateway] ${msg}`, meta ? JSON.stringify(meta) : ''),
  debug: (msg: string, meta?: Record<string, unknown>) =>
    console.debug(`[Gateway] ${msg}`, meta ? JSON.stringify(meta) : ''),
};

// Initialize handlers
let messageSender: MessageSender;
let sessionManager: SessionManager;
let contactManager: ContactManager;
let whatsappChannel: WhatsAppChannel;
let messageProcessor: GatewayMessageProcessor;
let rateLimiter: RateLimiter;
let channelManager: ChannelManager;
let channelRouter: ChannelRouter;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'gateway',
    whatsapp: whatsappClient.isReady() ? 'connected' : 'disconnected',
    redis: redisClient.status === 'ready' ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Session status endpoint
app.get('/api/session', (req, res) => {
  try {
    if (!sessionManager) {
      return res.status(503).json({
        error: 'Session manager not initialized',
      });
    }

    const status = sessionManager.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get session status',
    });
  }
});

// Session refresh endpoint
app.post('/api/session/refresh', async (req, res) => {
  try {
    if (!sessionManager) {
      return res.status(503).json({
        error: 'Session manager not initialized',
      });
    }

    await sessionManager.refreshSession();
    res.json({
      success: true,
      message: 'Session refresh initiated. Please scan the new QR code.',
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to refresh session',
    });
  }
});

// Channel status endpoint - get all registered channels with status
app.get('/api/channels', async (req, res) => {
  try {
    if (!channelManager) {
      return res.status(503).json({
        error: 'Channel manager not initialized',
      });
    }

    const status = await channelManager.getStatus();
    res.json({ channels: status });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get channel status',
    });
  }
});

// Contacts refresh endpoint - manually trigger re-fetch from WhatsApp
app.post('/api/contacts/refresh', async (req, res) => {
  try {
    if (!contactManager) {
      return res.status(503).json({
        error: 'WhatsApp not ready. Contact manager not initialized.',
      });
    }

    const contacts = await contactManager.fetchAndCacheContacts();
    res.json({
      success: true,
      count: contacts.length,
      message: `Successfully refreshed ${contacts.length} contacts`,
    });
  } catch (error: any) {
    console.error('[Gateway] Error refreshing contacts:', error);
    res.status(500).json({
      error: error.message || 'Failed to refresh contacts',
    });
  }
});

// Chat messages endpoint - fetch message history from WhatsApp
app.get('/api/chats/:contactId/messages', async (req, res) => {
  try {
    if (!whatsappClient.isReady()) {
      return res.status(503).json({
        error: 'WhatsApp not ready',
        messages: [],
      });
    }

    const { contactId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Validate contactId format
    if (!contactId || !contactId.includes('@')) {
      return res.status(400).json({
        error: 'Invalid contact ID format',
        messages: [],
      });
    }

    const messages = await fetchChatMessages(
      whatsappClient.getClient(),
      contactId,
      limit
    );

    res.json({ messages });
  } catch (error: unknown) {
    console.error('[Gateway] Error fetching messages:', error);

    // Handle WhatsApp disconnected/detached frame error
    if (error instanceof WhatsAppDisconnectedError) {
      return res.status(503).json({
        error: error.message,
        messages: [],
        needsReconnect: true,
      });
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch messages';

    // Handle specific WhatsApp errors gracefully
    if (errorMessage.includes('not found')) {
      return res.json({
        messages: [],
        error: 'Chat not found',
      });
    }

    res.status(500).json({
      error: errorMessage,
      messages: [],
    });
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`[Gateway] Client connected: ${socket.id}`);

  // Send current connection status on connect
  // Use whatsappClient.isReady() as primary source of truth
  socket.emit('connection_status', {
    status: whatsappClient.isReady() ? 'ready' : 'disconnected',
    timestamp: Date.now(),
  });

  // Send current session info on connect (if sessionManager is initialized)
  if (sessionManager) {
    const sessionStatus = sessionManager.getStatus();
    socket.emit('session_update', {
      ...sessionStatus,
      state: sessionStatus.state,
      needsRefresh: sessionStatus.needsRefresh,
      timeRemaining: sessionStatus.timeRemaining,
      createdAt: sessionStatus.createdAt,
      estimatedExpiryAt: sessionStatus.expiresAt,
      timestamp: Date.now(),
    });
  }

  socket.on('disconnect', () => {
    console.log(`[Gateway] Client disconnected: ${socket.id}`);
  });
});

/**
 * Response consumer loop - consumes responses from Orchestrator and sends them
 */
async function startResponseConsumer() {
  let lastId = '$'; // Start from latest

  console.log('[Gateway] Starting response consumer...');

  while (true) {
    try {
      const responses = await redisClient.consumeResponses(lastId);

      if (responses.length > 0) {
        console.log(`[Gateway] Processing ${responses.length} response(s)...`);

        for (const response of responses) {
          try {
            const { contactId, content, typingDelay, thinkTime } = response.payload;

            // Send message with enhanced HTS typing indicator
            const result = await messageSender.sendMessage(contactId, content, {
              typingDelay,
              thinkTime,
              simulateTyping: true,
              usePhaseTyping: thinkTime > 0,
            });

            if (result.success) {
              console.log(`[Gateway] Response sent to ${contactId}: ${result.messageId}`);

              // Store bot response in conversation history
              await historyStore.addMessage(contactId, {
                id: result.messageId || `response-${Date.now()}`,
                role: 'assistant',
                content,
                timestamp: Date.now(),
                type: 'outgoing',
              });

              // Emit message sent event
              io.emit('message_sent', {
                contactId,
                messageId: result.messageId,
                timestamp: Date.now(),
                delayMs: result.actualDelayMs,
              });
            } else {
              console.error(`[Gateway] Failed to send response to ${contactId}: ${result.error}`);

              // Emit message failed event
              io.emit('message_failed', {
                contactId,
                error: result.error,
                timestamp: Date.now(),
              });
            }

            // Delete response from queue
            await redisClient.deleteResponse(response.id);

            // Update lastId
            lastId = response.id;
          } catch (error) {
            console.error('[Gateway] Error processing response:', error);
          }
        }
      } else {
        // No responses, reset lastId to wait for new ones
        lastId = '$';
      }
    } catch (error) {
      console.error('[Gateway] Error in response consumer:', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function startGatewayService() {
  try {
    console.log('[Gateway] Starting Gateway Service...');
    console.log(`[Gateway] Environment: ${NODE_ENV}`);

    // Initialize Redis connection
    console.log('[Gateway] Connecting to Redis...');
    await redisClient.connect();
    console.log('[Gateway] Redis connected');

    // Create event emitter callback
    const emitEvent = (event: string, data: unknown) => io.emit(event, data);

    // Initialize rate limiter
    rateLimiter = new RateLimiter(
      {
        redis: redisClient.client,
        logger,
        emitEvent,
        publish: (channel: string, message: string) => redisClient.publish(channel, message),
      },
      {
        threshold: 10,
        windowSeconds: 60,
        autoPause: true,
      }
    );

    // Initialize message processor
    messageProcessor = new GatewayMessageProcessor({
      rateLimiter,
      pairingStore,
      historyStore,
      redisClient,
      logger,
      emitEvent,
      sendMessage: async (to: string, content: string) => {
        await messageSender.sendMessage(to, content, { simulateTyping: true });
      },
    });

    // Initialize channel manager
    channelManager = new ChannelManager(
      { logger, emitEvent },
      {
        enabled: true,
        contactLinkingEnabled: false, // Phase 3.1.6
        defaultChannel: 'whatsapp',
      }
    );

    // Initialize WhatsApp channel
    // Note: The channel will use the already-initialized whatsappClient singleton
    whatsappChannel = new WhatsAppChannel(
      {
        logger,
        emitEvent,
        config: { simulateTyping: true },
      },
      { autoConnect: false }
    );

    // Register channel with manager and enable it (this initializes WhatsApp client)
    console.log('[Gateway] Initializing WhatsApp client...');
    channelManager.register(whatsappChannel);
    await channelManager.enable('whatsapp');

    // Get the WhatsApp client after channel is initialized
    const client = whatsappClient.getClient();
    messageSender = new MessageSender(client);
    sessionManager = new SessionManager(client);

    // Initialize Telegram channel if enabled
    if (process.env['TELEGRAM_ENABLED'] === 'true') {
      const telegramToken = process.env['TELEGRAM_BOT_TOKEN'];
      if (!telegramToken) {
        console.warn('[Gateway] TELEGRAM_ENABLED=true but TELEGRAM_BOT_TOKEN not set');
      } else {
        console.log('[Gateway] Initializing Telegram channel...');
        const telegramChannel = new TelegramChannel(
          { logger, emitEvent },
          {
            botToken: telegramToken,
            skipGroups: true,
          },
          { autoConnect: false }
        );

        channelManager.register(telegramChannel);
        await channelManager.enable('telegram');

        // Log status changes
        telegramChannel.onStatusChange((status, error) => {
          console.log(`[Gateway] Telegram channel status: ${status}`, error ? `(${error})` : '');
        });

        console.log('[Gateway] Telegram channel registered');
      }
    }

    // Initialize channel router
    channelRouter = new ChannelRouter({
      channelManager,
      messageProcessor,
      logger,
    });

    // Set up message routing for all registered channels
    channelRouter.setupRoutes();

    // Register status change handler for logging
    whatsappChannel.onStatusChange((status, error) => {
      console.log(`[Gateway] WhatsApp channel status: ${status}`, error ? `(${error})` : '');
    });

    // Handle fromMe messages via message_create event
    // Note: The channel's 'message' handler ignores fromMe messages,
    // so we handle them separately for the auto-pause functionality
    client.on('message_create', async (message: { fromMe: boolean; to: string; id: { _serialized: string }; body: string }) => {
      if (message.fromMe) {
        const contactId = message.to;
        // Ignore group messages
        if (contactId.endsWith('@g.us')) return;

        await messageProcessor.handleFromMe(
          contactId,
          message.id._serialized,
          message.body,
          'whatsapp'
        );
      }
    });

    // Initialize session tracking when WhatsApp is ready
    client.on('ready', async () => {
      console.log('[Gateway] WhatsApp ready, initializing session manager...');
      await sessionManager.initialize();

      // Ensure session state reflects that WhatsApp is ready
      // This handles reconnection cases where 'authenticated' event doesn't fire
      const currentSession = sessionManager.getSessionInfo();
      if (currentSession?.state !== 'CONNECTED') {
        console.log('[Gateway] Session state not CONNECTED, updating...');
        await sessionManager.handleReauthentication();
      }

      // Initialize contact manager and fetch contacts
      contactManager = new ContactManager(client);
      await contactManager.fetchAndCacheContacts();
      console.log('[Gateway] Contacts cached');
    });

    // Handle re-authentication
    client.on('authenticated', async () => {
      console.log('[Gateway] WhatsApp authenticated');
      if (sessionManager) {
        await sessionManager.handleReauthentication();
      }
    });

    console.log('[Gateway] All handlers initialized');

    // Start response consumer in background
    startResponseConsumer().catch((error) => {
      console.error('[Gateway] Response consumer crashed:', error);
    });

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`[Gateway] Gateway service running on port ${PORT}`);
      console.log(`[Gateway] Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('[Gateway] Failed to start Gateway service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('[Gateway] Shutting down gracefully...');

  try {
    // Stop session manager first
    if (sessionManager) {
      sessionManager.stop();
    }

    // Remove routes before shutting down channels
    if (channelRouter) {
      channelRouter.removeRoutes();
    }

    // Shutdown channel manager (disconnects all channels)
    if (channelManager) {
      await channelManager.shutdown();
    } else {
      // Fallback to direct client destroy if manager not initialized
      await whatsappClient.destroy();
    }

    await redisClient.quit();
    httpServer.close(() => {
      console.log('[Gateway] Gateway service shut down');
      process.exit(0);
    });
  } catch (error) {
    console.error('[Gateway] Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the service
startGatewayService();
