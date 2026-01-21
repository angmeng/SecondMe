/**
 * Audit Logger
 * T115: Logs message processing events to JSONL file for audit trail
 */

import { createWriteStream, WriteStream, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOGS_DIR = resolve(__dirname, '../../../../logs');
const AUDIT_FILE = resolve(LOGS_DIR, 'messages.jsonl');

interface AuditEntry {
  timestamp: string;
  type: 'message_received' | 'message_classified' | 'response_generated' | 'message_sent' | 'error';
  messageId: string;
  contactId: string;
  contactName?: string;
  classification?: 'phatic' | 'substantive';
  contentPreview?: string;
  responsePreview?: string;
  tokensUsed?: number;
  latencyMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

class AuditLogger {
  private stream: WriteStream | null = null;
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = process.env['ENABLE_AUDIT_LOG'] !== 'false';

    if (this.isEnabled) {
      this.initializeStream();
    }
  }

  private initializeStream(): void {
    try {
      // Ensure logs directory exists
      if (!existsSync(LOGS_DIR)) {
        mkdirSync(LOGS_DIR, { recursive: true });
      }

      this.stream = createWriteStream(AUDIT_FILE, {
        flags: 'a', // Append mode
        encoding: 'utf8',
      });

      this.stream.on('error', (error) => {
        logger.error('Audit log stream error', { error: error.message });
        this.stream = null;
      });

      logger.info('Audit logger initialized', { file: AUDIT_FILE });
    } catch (error) {
      logger.error('Failed to initialize audit logger', { error });
      this.isEnabled = false;
    }
  }

  /**
   * Write an audit entry
   */
  private write(entry: AuditEntry): void {
    if (!this.isEnabled || !this.stream) return;

    try {
      const line = JSON.stringify(entry) + '\n';
      this.stream.write(line);
    } catch (error) {
      logger.error('Failed to write audit entry', { error });
    }
  }

  /**
   * Log when a message is received
   */
  logMessageReceived(
    messageId: string,
    contactId: string,
    contactName: string,
    content: string
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      type: 'message_received',
      messageId,
      contactId,
      contactName,
      contentPreview: this.truncateContent(content),
    });
  }

  /**
   * Log when a message is classified
   */
  logMessageClassified(
    messageId: string,
    contactId: string,
    classification: 'phatic' | 'substantive',
    tokensUsed: number
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      type: 'message_classified',
      messageId,
      contactId,
      classification,
      tokensUsed,
    });
  }

  /**
   * Log when a response is generated
   */
  logResponseGenerated(
    messageId: string,
    contactId: string,
    response: string,
    tokensUsed: number,
    latencyMs: number
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      type: 'response_generated',
      messageId,
      contactId,
      responsePreview: this.truncateContent(response),
      tokensUsed,
      latencyMs,
    });
  }

  /**
   * Log when a message is sent
   */
  logMessageSent(
    messageId: string,
    contactId: string,
    typingDelayMs: number
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      type: 'message_sent',
      messageId,
      contactId,
      metadata: { typingDelayMs },
    });
  }

  /**
   * Log an error during message processing
   */
  logError(
    messageId: string,
    contactId: string,
    error: string,
    stage?: string
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      type: 'error',
      messageId,
      contactId,
      error,
      metadata: { stage },
    });
  }

  /**
   * Truncate content for preview (no sensitive data storage)
   */
  private truncateContent(content: string, maxLength: number = 100): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }

  /**
   * Close the audit logger
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(() => {
          logger.info('Audit logger closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
