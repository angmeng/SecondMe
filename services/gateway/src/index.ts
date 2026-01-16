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
import { SocketEventEmitter } from './socket/events.js';
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
            const { contactId, content, typingDelay } = response.payload;

            // Send message with typing indicator
            const result = await messageSender.sendMessage(contactId, content, {
              typingDelay,
              simulateTyping: true,
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
    socketEmitter = new SocketEventEmitter(io);

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
