/**
 * Graph Worker Service
 * Consumes chat history from Redis, extracts entities, and updates knowledge graph
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

import { redisClient } from './redis/client.js';
import { falkordbClient } from './falkordb/client.js';

const SERVICE_NAME = 'Graph Worker';
const CHAT_HISTORY_QUEUE = 'QUEUE:chat_history';

async function startGraphWorkerService() {
  console.log(`[${SERVICE_NAME}] Starting Graph Worker Service...`);

  try {
    // Connect to Redis
    console.log(`[${SERVICE_NAME}] Connecting to Redis...`);
    await redisClient.connect();

    // Connect to FalkorDB
    console.log(`[${SERVICE_NAME}] Connecting to FalkorDB...`);
    await falkordbClient.connect();

    console.log(`[${SERVICE_NAME}] Graph Worker Service started successfully`);
    console.log(`[${SERVICE_NAME}] Listening for chat history on ${CHAT_HISTORY_QUEUE}...`);

    // Start processing chat history queue
    await processChatHistoryQueue();
  } catch (error) {
    console.error(`[${SERVICE_NAME}] Failed to start service:`, error);
    process.exit(1);
  }
}

/**
 * Main processing loop - consumes chat history from Redis queue
 */
async function processChatHistoryQueue() {
  let lastId = '$'; // Start from latest messages

  while (true) {
    try {
      // Consume messages from Redis stream (5s blocking read)
      const messages = await redisClient.consumeChatHistory(lastId);

      if (messages.length > 0) {
        console.log(`[${SERVICE_NAME}] Processing ${messages.length} chat history item(s)...`);

        for (const message of messages) {
          try {
            await processChatHistoryItem(message);

            // Delete message after successful processing
            await redisClient.deleteChatHistory(message.id);

            // Update lastId for next iteration
            lastId = message.id;
          } catch (error) {
            console.error(`[${SERVICE_NAME}] Error processing message ${message.id}:`, error);
            // Continue processing other messages
          }
        }
      } else {
        // Reset to '$' to wait for new messages
        lastId = '$';
      }
    } catch (error) {
      console.error(`[${SERVICE_NAME}] Error consuming chat history:`, error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Process a single chat history item
 * TODO: Implement entity extraction and graph mutations in Phase 3
 */
async function processChatHistoryItem(message: { id: string; fields: Record<string, string> }) {
  const { contactId, content, timestamp } = message.fields;

  console.log(
    `[${SERVICE_NAME}] Chat history item: contactId=${contactId}, timestamp=${timestamp}`
  );

  // Placeholder for Phase 3 implementation:
  // 1. Extract entities using Claude Sonnet (Person, Company, Event, Topic)
  // 2. Create/update nodes in FalkorDB
  // 3. Create/update relationships (KNOWS, WORKS_AT, MENTIONED)
  // 4. Update relationship properties (lastMentioned, times)

  // For now, just log that we received it
  console.log(`[${SERVICE_NAME}] Chat history processed (placeholder)`);
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  console.log(`[${SERVICE_NAME}] Shutting down gracefully...`);

  try {
    await redisClient.quit();
    await falkordbClient.quit();
    console.log(`[${SERVICE_NAME}] All connections closed`);
    process.exit(0);
  } catch (error) {
    console.error(`[${SERVICE_NAME}] Error during shutdown:`, error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the service
startGraphWorkerService();
