/**
 * Voice Transcriber
 * Uses OpenAI Whisper API to transcribe voice messages
 * Phase 4: Voice & Media Implementation
 */

import OpenAI from 'openai';
import type { TranscriptionResult, TranscriptionConfig } from '@secondme/shared-types';
import { DEFAULT_TRANSCRIPTION_CONFIG } from '@secondme/shared-types';

/**
 * Configuration for the voice transcriber
 */
export interface VoiceTranscriberConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Whisper model to use (default: 'whisper-1') */
  model?: string;
  /** Transcription configuration */
  transcriptionConfig?: Partial<TranscriptionConfig>;
}

/**
 * Voice Transcriber using OpenAI Whisper API
 */
export class VoiceTranscriber {
  private client: OpenAI;
  private model: string;
  private config: TranscriptionConfig;
  private enabled: boolean;

  constructor(config: VoiceTranscriberConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'whisper-1';
    this.config = {
      ...DEFAULT_TRANSCRIPTION_CONFIG,
      ...config.transcriptionConfig,
    };
    this.enabled = this.config.enabled && !!config.apiKey;

    if (!config.apiKey) {
      console.warn('[VoiceTranscriber] No API key provided, transcription disabled');
    } else {
      console.log('[VoiceTranscriber] Initialized with model:', this.model);
    }
  }

  /**
   * Check if transcription is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Transcribe audio from base64-encoded data
   *
   * @param base64Audio - Base64-encoded audio data
   * @param mimeType - MIME type of the audio (e.g., 'audio/ogg')
   * @returns Transcription result with text and metadata
   */
  async transcribe(base64Audio: string, mimeType: string): Promise<TranscriptionResult> {
    if (!this.enabled) {
      throw new Error('Voice transcription is disabled');
    }

    // Check file size (base64 is ~4/3 the size of binary)
    const estimatedSize = Math.floor((base64Audio.length * 3) / 4);
    if (estimatedSize > this.config.maxFileSizeBytes) {
      throw new Error(
        `Audio file too large: ${Math.round(estimatedSize / 1024 / 1024)}MB exceeds limit of ${Math.round(this.config.maxFileSizeBytes / 1024 / 1024)}MB`
      );
    }

    const startTime = Date.now();

    try {
      // Convert base64 to Buffer
      const buffer = Buffer.from(base64Audio, 'base64');

      // Create a Blob from the buffer
      const blob = new Blob([buffer], { type: mimeType });

      // Determine file extension from mime type
      const extension = this.getExtensionFromMimeType(mimeType);
      const filename = `audio.${extension}`;

      // Create a File object for the API
      const file = new File([blob], filename, { type: mimeType });

      // Call Whisper API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await this.client.audio.transcriptions.create(
          {
            file,
            model: this.model,
            response_format: 'verbose_json', // Get additional metadata
          },
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        const latency = Date.now() - startTime;
        console.log(
          `[VoiceTranscriber] Transcription completed in ${latency}ms, language: ${response.language || 'unknown'}`
        );

        // Build result object, only including optional fields if they exist
        const result: TranscriptionResult = {
          text: response.text,
        };

        if (response.language) {
          result.language = response.language;
        }

        if (response.duration) {
          result.durationMs = Math.round(response.duration * 1000);
        }

        return result;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const latency = Date.now() - startTime;

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error(`[VoiceTranscriber] Transcription timed out after ${latency}ms`);
          throw new Error(`Transcription timed out after ${this.config.timeoutMs}ms`);
        }

        console.error(`[VoiceTranscriber] Transcription failed after ${latency}ms:`, error.message);
        throw error;
      }

      throw new Error('Unknown transcription error');
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    // Remove any codec info (e.g., "audio/ogg; codecs=opus" -> "audio/ogg")
    const baseMimeType = mimeType.split(';')[0]?.trim() || mimeType;

    const mimeToExt: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/mp4': 'm4a',
      'audio/m4a': 'm4a',
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/webm': 'webm',
      'audio/flac': 'flac',
    };

    return mimeToExt[baseMimeType] || 'ogg'; // Default to ogg for unknown types
  }
}

// Singleton instance (lazy initialization)
let transcriber: VoiceTranscriber | null = null;

/**
 * Get the global voice transcriber instance
 * Creates the instance on first call
 */
export function getVoiceTranscriber(): VoiceTranscriber {
  if (!transcriber) {
    const apiKey = process.env['OPENAI_API_KEY'] || '';
    const enabled = process.env['VOICE_TRANSCRIPTION_ENABLED'] !== 'false';
    const maxSizeMB = parseInt(process.env['MEDIA_MAX_SIZE_MB'] || '25', 10);
    const timeoutMs = parseInt(process.env['TRANSCRIPTION_TIMEOUT_MS'] || '30000', 10);

    transcriber = new VoiceTranscriber({
      apiKey,
      transcriptionConfig: {
        enabled,
        maxFileSizeBytes: maxSizeMB * 1024 * 1024,
        timeoutMs,
      },
    });
  }

  return transcriber;
}

/**
 * Reset the global transcriber instance (for testing)
 */
export function resetVoiceTranscriber(): void {
  transcriber = null;
}
