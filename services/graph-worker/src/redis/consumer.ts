/**
 * Redis Consumer - Chat History Queue Consumer
 * User Story 2: Consumes chat messages for entity extraction and graph building
 * Per-Contact Style Profiling: Analyzes outgoing messages for style patterns
 */

import { redisClient } from './client.js';
import { parseWhatsAppExport, filterTextMessages, groupIntoConversationChunks, ParsedMessage } from '../ingestion/chat-parser.js';
import { extractEntities, deduplicateEntities } from '../ingestion/entity-extractor.js';
import { buildGraphFromEntities } from '../ingestion/graph-builder.js';
import { recordProcessedMessage, updateContactLastInteraction, updateContactRelationshipType } from '../falkordb/mutations.js';
import { RelationshipAnalyzer, RelationshipType, RelationshipSignal } from '../analysis/relationship-analyzer.js';
import { StyleAnalyzer } from '../analysis/style-analyzer.js';

const SERVICE_NAME = 'Graph Worker Consumer';
const REAL_TIME_QUEUE = 'QUEUE:messages_for_extraction';
const RELATIONSHIP_SIGNALS_QUEUE = 'QUEUE:relationship_signals';

/**
 * Consumer configuration
 */
interface ConsumerConfig {
  batchSize: number;
  blockTimeMs: number;
  minMessagesForExtraction: number;
  extractionChunkMinutes: number;
}

const DEFAULT_CONFIG: ConsumerConfig = {
  batchSize: 10,
  blockTimeMs: 5000,
  minMessagesForExtraction: 3, // Minimum messages before triggering extraction
  extractionChunkMinutes: 60, // Group messages within 1 hour for extraction
};

/**
 * Message from Redis queue
 */
interface QueueMessage {
  id: string;
  fields: Record<string, string>;
}

/**
 * Extraction batch for accumulating messages
 */
interface ExtractionBatch {
  contactId: string;
  contactName: string;
  messages: Array<{
    content: string;
    sender: string;
    timestamp: number;
  }>;
  lastTimestamp: number;
}

/**
 * Redis Consumer class - handles queue consumption and processing
 */
class RedisConsumer {
  private config: ConsumerConfig;
  private extractionBatches: Map<string, ExtractionBatch> = new Map();
  private isRunning: boolean = false;
  private relationshipAnalyzer: RelationshipAnalyzer | null = null;
  private styleAnalyzer: StyleAnalyzer | null = null;
  private signalBatches: Map<string, Array<{ signal: RelationshipSignal; timestamp: number }>> = new Map();
  private lastSignalFlush: number = Date.now();

  constructor(config: Partial<ConsumerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get or create the StyleAnalyzer instance
   */
  private getStyleAnalyzer(): StyleAnalyzer {
    if (!this.styleAnalyzer) {
      this.styleAnalyzer = new StyleAnalyzer(redisClient.client);
    }
    return this.styleAnalyzer;
  }

  /**
   * Start consuming from chat history queue (bulk imports)
   */
  async startChatHistoryConsumer(): Promise<void> {
    if (this.isRunning) {
      console.warn(`[${SERVICE_NAME}] Consumer already running`);
      return;
    }

    this.isRunning = true;
    let lastId = '$';

    console.log(`[${SERVICE_NAME}] Starting chat history consumer...`);

    while (this.isRunning) {
      try {
        const messages = await redisClient.consumeChatHistory(lastId, this.config.blockTimeMs);

        if (messages.length > 0) {
          console.log(`[${SERVICE_NAME}] Processing ${messages.length} chat history items...`);

          for (const message of messages) {
            try {
              await this.processChatHistoryMessage(message);
              await redisClient.deleteChatHistory(message.id);
              lastId = message.id;
            } catch (error) {
              console.error(`[${SERVICE_NAME}] Error processing message ${message.id}:`, error);
            }
          }
        } else {
          lastId = '$';
        }
      } catch (error) {
        console.error(`[${SERVICE_NAME}] Error in chat history consumer:`, error);
        await this.sleep(5000);
      }
    }
  }

  /**
   * Start consuming from real-time message queue
   */
  async startRealTimeConsumer(): Promise<void> {
    if (this.isRunning) {
      console.warn(`[${SERVICE_NAME}] Consumer already running`);
      return;
    }

    this.isRunning = true;
    let lastId = '$';

    console.log(`[${SERVICE_NAME}] Starting real-time message consumer...`);

    while (this.isRunning) {
      try {
        const results = await redisClient.client.xread(
          'BLOCK',
          this.config.blockTimeMs,
          'STREAMS',
          REAL_TIME_QUEUE,
          lastId
        );

        if (results && results.length > 0) {
          for (const [, entries] of results) {
            for (const [id, fieldArray] of entries as any[]) {
              try {
                const fields: Record<string, string> = {};
                for (let i = 0; i < fieldArray.length; i += 2) {
                  fields[fieldArray[i]] = fieldArray[i + 1];
                }

                await this.processRealTimeMessage({ id, fields });
                await redisClient.client.xdel(REAL_TIME_QUEUE, id);
                lastId = id;
              } catch (error) {
                console.error(`[${SERVICE_NAME}] Error processing real-time message ${id}:`, error);
              }
            }
          }
        } else {
          // Check for pending batches that need extraction
          await this.flushPendingBatches();
          lastId = '$';
        }
      } catch (error) {
        console.error(`[${SERVICE_NAME}] Error in real-time consumer:`, error);
        await this.sleep(5000);
      }
    }
  }


  /**
   * Start consuming from relationship signals queue (background analysis)
   * Batches signals by contactId and processes on threshold or timeout
   */
  async startRelationshipSignalsConsumer(): Promise<void> {
    // Initialize the relationship analyzer if not done
    if (!this.relationshipAnalyzer) {
      this.relationshipAnalyzer = new RelationshipAnalyzer(redisClient.client);
    }

    let lastId = '$';
    const BATCH_THRESHOLD = 10; // Process after 10 signals per contact
    const FLUSH_INTERVAL_MS = 30000; // Flush every 30 seconds

    console.log(`[${SERVICE_NAME}] Starting relationship signals consumer...`);

    while (this.isRunning) {
      try {
        const results = await redisClient.client.xread(
          'BLOCK',
          this.config.blockTimeMs,
          'STREAMS',
          RELATIONSHIP_SIGNALS_QUEUE,
          lastId
        );

        if (results && results.length > 0) {
          for (const [, entries] of results) {
            for (const [id, fieldArray] of entries as any[]) {
              try {
                const fields: Record<string, string> = {};
                for (let i = 0; i < fieldArray.length; i += 2) {
                  fields[fieldArray[i]] = fieldArray[i + 1];
                }

                // Extract signal from queue message
                const contactId = fields['contactId'];
                const type = fields['type'] as RelationshipType;
                const confidence = parseFloat(fields['confidence'] || '0');
                const evidence = fields['evidence'] || '';
                const source = fields['source'] as 'outgoing' | 'incoming' || 'incoming';
                const timestamp = parseInt(fields['timestamp'] || Date.now().toString(), 10);

                if (!contactId || !type) {
                  console.warn(`[${SERVICE_NAME}] Skipping signal ${id}: missing contactId or type`);
                  await redisClient.client.xdel(RELATIONSHIP_SIGNALS_QUEUE, id);
                  lastId = id;
                  continue;
                }

                // Add to batch
                if (!this.signalBatches.has(contactId)) {
                  this.signalBatches.set(contactId, []);
                }
                this.signalBatches.get(contactId)!.push({
                  signal: { type, confidence, evidence, source },
                  timestamp,
                });

                // Delete from queue
                await redisClient.client.xdel(RELATIONSHIP_SIGNALS_QUEUE, id);
                lastId = id;

                // Check if batch threshold reached for this contact
                const batch = this.signalBatches.get(contactId)!;
                if (batch.length >= BATCH_THRESHOLD) {
                  await this.processSignalBatch(contactId);
                }
              } catch (error) {
                console.error(`[${SERVICE_NAME}] Error processing signal ${id}:`, error);
              }
            }
          }
        }

        // Check for time-based flush
        const now = Date.now();
        if (now - this.lastSignalFlush >= FLUSH_INTERVAL_MS) {
          await this.flushAllSignalBatches();
          this.lastSignalFlush = now;
        }

        if (!results || results.length === 0) {
          lastId = '$';
        }
      } catch (error) {
        console.error(`[${SERVICE_NAME}] Error in relationship signals consumer:`, error);
        await this.sleep(5000);
      }
    }
  }

  /**
   * Process accumulated signals for a contact
   */
  private async processSignalBatch(contactId: string): Promise<void> {
    const batch = this.signalBatches.get(contactId);
    if (!batch || batch.length === 0 || !this.relationshipAnalyzer) return;

    console.log(`[${SERVICE_NAME}] Processing ${batch.length} signals for ${contactId}...`);

    try {
      // Check for manual override
      const hasOverride = await this.relationshipAnalyzer.hasManualOverride(contactId);
      if (hasOverride) {
        console.log(`[${SERVICE_NAME}] Skipping ${contactId}: manual override set`);
        this.signalBatches.delete(contactId);
        return;
      }

      // Process each signal
      let analysisResult = null;
      for (const { signal } of batch) {
        analysisResult = await this.relationshipAnalyzer.processSignal(contactId, signal);
      }

      // Check if we should update FalkorDB
      if (analysisResult && analysisResult.shouldUpdate && analysisResult.newType && analysisResult.newConfidence !== undefined) {
        console.log(
          `[${SERVICE_NAME}] Updating ${contactId}: ${analysisResult.newType} (${Math.round(analysisResult.newConfidence * 100)}%) - ${analysisResult.reason}`
        );

        // Update FalkorDB
        await updateContactRelationshipType(
          contactId,
          analysisResult.newType,
          analysisResult.newConfidence,
          'auto_detected'
        );

        // Mark as updated in analyzer
        await this.relationshipAnalyzer.markAsUpdated(
          contactId,
          analysisResult.newType,
          analysisResult.newConfidence
        );
      }

      // Clear the batch
      this.signalBatches.delete(contactId);
    } catch (error) {
      console.error(`[${SERVICE_NAME}] Error processing signal batch for ${contactId}:`, error);
    }
  }

  /**
   * Flush all pending signal batches
   */
  private async flushAllSignalBatches(): Promise<void> {
    const contactIds = Array.from(this.signalBatches.keys());
    if (contactIds.length === 0) return;

    console.log(`[${SERVICE_NAME}] Flushing ${contactIds.length} signal batches...`);

    for (const contactId of contactIds) {
      await this.processSignalBatch(contactId);
    }
  }

  /**
   * Process a bulk chat history message (from WhatsApp export)
   */
  private async processChatHistoryMessage(message: QueueMessage): Promise<void> {
    const { contactId, contactName, content, type } = message.fields;

    // Type guards for required fields
    if (!contactId || !content) {
      console.warn(`[${SERVICE_NAME}] Skipping message ${message.id}: missing contactId or content`);
      return;
    }

    if (type === 'export') {
      // Full chat export - parse and process
      await this.processWhatsAppExport(contactId, contactName || 'Unknown', content);
    } else {
      // Single message - add to batch
      await this.addToBatch(contactId, contactName || 'Unknown', {
        content,
        sender: 'contact',
        timestamp: parseInt(message.fields['timestamp'] || Date.now().toString(), 10),
      });
    }
  }

  /**
   * Process a real-time message for extraction
   */
  private async processRealTimeMessage(message: QueueMessage): Promise<void> {
    const { contactId, contactName, content, sender, fromMe } = message.fields;

    // Type guards for required fields
    if (!contactId || !content) {
      console.warn(`[${SERVICE_NAME}] Skipping real-time message ${message.id}: missing contactId or content`);
      return;
    }

    const timestamp = parseInt(message.fields['timestamp'] || Date.now().toString(), 10);

    // Analyze outgoing messages for style profiling
    // Check both 'fromMe' field and 'sender === me' for compatibility
    const isOutgoing = fromMe === 'true' || sender === 'me';
    if (isOutgoing) {
      try {
        await this.getStyleAnalyzer().analyzeOutgoingMessage(contactId, content);
      } catch (error) {
        console.error(`[${SERVICE_NAME}] Style analysis error for ${contactId}:`, error);
        // Don't fail message processing if style analysis fails
      }
    }

    await this.addToBatch(contactId, contactName || 'Unknown', {
      content,
      sender: sender || 'contact',
      timestamp,
    });
  }

  /**
   * Process a full WhatsApp export
   */
  private async processWhatsAppExport(
    contactId: string,
    contactName: string,
    exportContent: string
  ): Promise<void> {
    console.log(`[${SERVICE_NAME}] Processing WhatsApp export for ${contactId}...`);

    const startTime = Date.now();

    // Parse the export
    const parsed = parseWhatsAppExport(exportContent);
    console.log(`[${SERVICE_NAME}] Parsed ${parsed.messageCount} messages from export`);

    // Filter to text messages only
    const textMessages = filterTextMessages(parsed.messages);
    console.log(`[${SERVICE_NAME}] ${textMessages.length} text messages after filtering`);

    // Group into conversation chunks
    const chunks = groupIntoConversationChunks(textMessages, this.config.extractionChunkMinutes);
    console.log(`[${SERVICE_NAME}] Split into ${chunks.length} conversation chunks`);

    // Process each chunk
    let totalEntities = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || chunk.length < this.config.minMessagesForExtraction) continue;

      console.log(`[${SERVICE_NAME}] Processing chunk ${i + 1}/${chunks.length} (${chunk.length} messages)...`);

      // Extract entities
      const result = await extractEntities(
        chunk.map((m) => ({
          ...m,
          rawLine: m.rawLine,
        })),
        contactName
      );

      if (result.entities.length > 0) {
        // Build graph from entities
        const graphResult = await buildGraphFromEntities(contactId, result.entities);
        totalEntities += result.entities.length;

        if (graphResult.errors.length > 0) {
          console.warn(`[${SERVICE_NAME}] Graph errors for chunk ${i + 1}:`, graphResult.errors);
        }
      }

      // Small delay between chunks to avoid overwhelming the API
      if (i < chunks.length - 1) {
        await this.sleep(500);
      }
    }

    // Update contact last interaction
    if (parsed.endDate) {
      await updateContactLastInteraction(contactId, parsed.endDate.getTime());
    }

    const latency = Date.now() - startTime;
    console.log(
      `[${SERVICE_NAME}] Export processing complete: ${totalEntities} entities extracted in ${latency}ms`
    );
  }

  /**
   * Add message to extraction batch
   */
  private async addToBatch(
    contactId: string,
    contactName: string,
    message: { content: string; sender: string; timestamp: number }
  ): Promise<void> {
    let batch = this.extractionBatches.get(contactId);

    if (!batch) {
      batch = {
        contactId,
        contactName,
        messages: [],
        lastTimestamp: Date.now(),
      };
      this.extractionBatches.set(contactId, batch);
    }

    batch.messages.push(message);
    batch.lastTimestamp = Date.now();

    // Check if batch should be processed
    if (batch.messages.length >= this.config.minMessagesForExtraction) {
      await this.processBatch(contactId);
    }
  }

  /**
   * Process a pending batch
   */
  private async processBatch(contactId: string): Promise<void> {
    const batch = this.extractionBatches.get(contactId);
    if (!batch || batch.messages.length === 0) return;

    console.log(`[${SERVICE_NAME}] Processing batch for ${contactId} (${batch.messages.length} messages)...`);

    try {
      // Convert to ParsedMessage format for extraction
      const parsedMessages: ParsedMessage[] = batch.messages.map((m) => ({
        timestamp: new Date(m.timestamp),
        sender: m.sender,
        content: m.content,
        isMedia: false,
        mediaType: undefined,
        rawLine: undefined,
      }));

      // Extract entities
      const result = await extractEntities(parsedMessages, batch.contactName);

      if (result.entities.length > 0) {
        // Deduplicate entities
        const deduplicated = deduplicateEntities(result.entities);

        // Build graph
        const graphResult = await buildGraphFromEntities(contactId, deduplicated);

        // Record processing
        await recordProcessedMessage(
          `batch-${contactId}-${Date.now()}`,
          contactId,
          deduplicated.length,
          Date.now()
        );

        console.log(
          `[${SERVICE_NAME}] Batch processed: ${deduplicated.length} entities, ${graphResult.relationshipsCreated} relationships`
        );
      }

      // Update last interaction
      const lastTimestamp = batch.messages[batch.messages.length - 1]?.timestamp;
      if (lastTimestamp) {
        await updateContactLastInteraction(contactId, lastTimestamp);
      }

      // Clear the batch
      this.extractionBatches.delete(contactId);
    } catch (error) {
      console.error(`[${SERVICE_NAME}] Error processing batch for ${contactId}:`, error);
    }
  }

  /**
   * Flush pending batches that have been waiting too long
   */
  private async flushPendingBatches(): Promise<void> {
    const now = Date.now();
    const maxAge = 60000; // 1 minute

    for (const [contactId, batch] of this.extractionBatches) {
      if (now - batch.lastTimestamp > maxAge && batch.messages.length > 0) {
        console.log(`[${SERVICE_NAME}] Flushing stale batch for ${contactId}...`);
        await this.processBatch(contactId);
      }
    }
  }

  /**
   * Stop the consumer
   */
  stop(): void {
    this.isRunning = false;
    console.log(`[${SERVICE_NAME}] Consumer stopping...`);
  }

  /**
   * Helper sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const redisConsumer = new RedisConsumer();

/**
 * Start the consumer (convenience function)
 */
export async function startConsumer(mode: 'chat_history' | 'real_time' | 'both' | 'all' = 'all'): Promise<void> {
  if (mode === 'chat_history' || mode === 'both' || mode === 'all') {
    redisConsumer.startChatHistoryConsumer().catch((error) => {
      console.error(`[${SERVICE_NAME}] Chat history consumer error:`, error);
    });
  }

  if (mode === 'real_time' || mode === 'both' || mode === 'all') {
    redisConsumer.startRealTimeConsumer().catch((error) => {
      console.error(`[${SERVICE_NAME}] Real-time consumer error:`, error);
    });
  }

  // Always start relationship signals consumer for background analysis
  if (mode === 'all') {
    redisConsumer.startRelationshipSignalsConsumer().catch((error) => {
      console.error(`[${SERVICE_NAME}] Relationship signals consumer error:`, error);
    });
  }
}

/**
 * Stop the consumer (convenience function)
 */
export function stopConsumer(): void {
  redisConsumer.stop();
}
