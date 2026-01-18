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
import { AuthHandler } from './whatsapp/auth.js';
import { MessageHandler } from './whatsapp/message-handler.js';
import { MessageSender } from './whatsapp/sender.js';
import { SessionManager } from './whatsapp/session-manager.js';
import { ContactManager } from './whatsapp/contact-manager.js';
import { SocketEventEmitter } from './socket/events.js';
import { fetchChatMessages } from './whatsapp/message-fetcher.js';
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

// Initialize handlers
let authHandler: AuthHandler;
let messageHandler: MessageHandler;
let messageSender: MessageSender;
let sessionManager: SessionManager;
let contactManager: ContactManager;
let socketEmitter: SocketEventEmitter;

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
  } catch (error: any) {
    console.error('[Gateway] Error fetching messages:', error);

    // Handle specific WhatsApp errors gracefully
    if (error.message?.includes('not found')) {
      return res.json({
        messages: [],
        error: 'Chat not found',
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to fetch messages',
      messages: [],
    });
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`[Gateway] Client connected: ${socket.id}`);

  // Send current connection status on connect
  // Use whatsappClient.isReady() as primary source of truth to handle race condition
  // where authHandler may be created after WhatsApp 'ready' event fires
  socket.emit('connection_status', {
    status: whatsappClient.isReady() ? 'ready' : (authHandler?.getStatus() || 'disconnected'),
    timestamp: Date.now(),
  });

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
            } else {
              console.error(`[Gateway] Failed to send response to ${contactId}: ${result.error}`);
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

    // Initialize WhatsApp client
    console.log('[Gateway] Initializing WhatsApp client...');
    await whatsappClient.initialize();

    // Initialize handlers after WhatsApp client is ready
    const client = whatsappClient.getClient();
    authHandler = new AuthHandler(client);
    messageHandler = new MessageHandler(client);
    messageSender = new MessageSender(client);
    sessionManager = new SessionManager(client);
    socketEmitter = new SocketEventEmitter(io);

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

    await whatsappClient.destroy();
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
