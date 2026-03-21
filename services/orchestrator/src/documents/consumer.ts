/**
 * Document Queue Consumer
 * Consumes documents from QUEUE:documents and processes them
 */

import { redisClient } from '../redis/client.js';
import { getDocumentProcessor, parseQueuedDocument } from './processor.js';

const QUEUE_NAME = 'QUEUE:documents';
const CONSUMER_GROUP = 'orchestrator-docs';
const CONSUMER_NAME = 'orchestrator-doc-1';

// Feature flag
const DOCUMENT_UPLOAD_ENABLED = process.env['DOCUMENT_UPLOAD_ENABLED'] !== 'false';

/**
 * Document Consumer state
 */
interface ConsumerState {
  isRunning: boolean;
  lastProcessedId: string;
  processedCount: number;
  errorCount: number;
}

const state: ConsumerState = {
  isRunning: false,
  lastProcessedId: '>',
  processedCount: 0,
  errorCount: 0,
};

/**
 * Initialize consumer group
 * Creates the stream and consumer group if they don't exist
 */
async function initializeConsumerGroup(): Promise<void> {
  try {
    // Create consumer group (MKSTREAM creates the stream if it doesn't exist)
    await redisClient.client.xgroup(
      'CREATE',
      QUEUE_NAME,
      CONSUMER_GROUP,
      '0',
      'MKSTREAM'
    );
    console.log(`[DocumentConsumer] Created consumer group ${CONSUMER_GROUP}`);
  } catch (error) {
    // Ignore error if group already exists
    if (error instanceof Error && error.message.includes('BUSYGROUP')) {
      console.log(`[DocumentConsumer] Consumer group ${CONSUMER_GROUP} already exists`);
    } else {
      throw error;
    }
  }
}

/**
 * Process a single message from the queue
 */
async function processMessage(
  messageId: string,
  fields: Record<string, string>
): Promise<void> {
  const data = fields['data'];
  if (!data) {
    console.warn(`[DocumentConsumer] Message ${messageId} has no data field`);
    await acknowledgeMessage(messageId);
    return;
  }

  const queuedDoc = parseQueuedDocument(data);
  if (!queuedDoc) {
    console.warn(`[DocumentConsumer] Message ${messageId} has invalid document format`);
    await acknowledgeMessage(messageId);
    return;
  }

  console.log(
    `[DocumentConsumer] Processing document ${queuedDoc.documentId}: ${queuedDoc.originalName}`
  );

  const processor = getDocumentProcessor();
  const result = await processor.process(queuedDoc);

  if (result.status === 'completed') {
    state.processedCount++;
    console.log(
      `[DocumentConsumer] Successfully processed ${queuedDoc.documentId} (${result.chunkCount} chunks)`
    );
  } else {
    state.errorCount++;
    console.error(
      `[DocumentConsumer] Failed to process ${queuedDoc.documentId}: ${result.error}`
    );
  }

  await acknowledgeMessage(messageId);
}

/**
 * Acknowledge a message as processed
 */
async function acknowledgeMessage(messageId: string): Promise<void> {
  await redisClient.client.xack(QUEUE_NAME, CONSUMER_GROUP, messageId);
  state.lastProcessedId = messageId;
}

/**
 * Consume messages from the document queue
 */
async function consumeDocuments(): Promise<void> {
  console.log('[DocumentConsumer] Starting document queue consumer...');

  while (state.isRunning) {
    try {
      // Read new messages from stream using consumer group
      const results = await redisClient.client.xreadgroup(
        'GROUP',
        CONSUMER_GROUP,
        CONSUMER_NAME,
        'COUNT',
        1, // Process one at a time for reliability
        'BLOCK',
        5000, // Block for 5 seconds waiting for new messages
        'STREAMS',
        QUEUE_NAME,
        '>' // Only new messages
      );

      if (!results || results.length === 0) {
        continue;
      }

      // Process messages - results is [stream, [[id, [field, value, ...]], ...]][]
      for (const streamResult of results as Array<[string, Array<[string, string[]]>]>) {
        const [_streamName, entries] = streamResult;
        for (const entry of entries) {
          const [messageId, fieldArray] = entry;
          // Convert field array to object
          const fields: Record<string, string> = {};
          for (let i = 0; i < fieldArray.length; i += 2) {
            const key = fieldArray[i];
            const value = fieldArray[i + 1];
            if (key !== undefined && value !== undefined) {
              fields[key] = value;
            }
          }

          try {
            await processMessage(messageId, fields);
          } catch (error) {
            state.errorCount++;
            console.error(
              `[DocumentConsumer] Error processing message ${messageId}:`,
              error
            );
            // Still acknowledge to prevent retry loop
            await acknowledgeMessage(messageId);
          }
        }
      }
    } catch (error) {
      console.error('[DocumentConsumer] Error in consumer loop:', error);
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  console.log('[DocumentConsumer] Consumer stopped');
}

/**
 * Start the document consumer
 */
export async function startDocumentConsumer(): Promise<void> {
  if (!DOCUMENT_UPLOAD_ENABLED) {
    console.log('[DocumentConsumer] Document upload disabled, consumer not started');
    return;
  }

  if (state.isRunning) {
    console.warn('[DocumentConsumer] Consumer already running');
    return;
  }

  state.isRunning = true;

  try {
    await initializeConsumerGroup();
    // Start consuming in background (don't await)
    consumeDocuments().catch((error) => {
      console.error('[DocumentConsumer] Consumer crashed:', error);
      state.isRunning = false;
    });
  } catch (error) {
    console.error('[DocumentConsumer] Failed to start consumer:', error);
    state.isRunning = false;
    throw error;
  }
}

/**
 * Stop the document consumer gracefully
 */
export function stopDocumentConsumer(): void {
  if (!state.isRunning) {
    return;
  }

  console.log('[DocumentConsumer] Stopping document consumer...');
  state.isRunning = false;
}

/**
 * Get consumer statistics
 */
export function getConsumerStats(): {
  isRunning: boolean;
  processedCount: number;
  errorCount: number;
} {
  return {
    isRunning: state.isRunning,
    processedCount: state.processedCount,
    errorCount: state.errorCount,
  };
}
