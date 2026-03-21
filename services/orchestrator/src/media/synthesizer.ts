/**
 * Voice Synthesizer
 * Uses ElevenLabs API to synthesize voice responses
 * Phase 5: Text-to-Speech Implementation
 */

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { SynthesisResult, SynthesisConfig } from '@secondme/shared-types';
import { DEFAULT_SYNTHESIS_CONFIG } from '@secondme/shared-types';

/**
 * Per-request synthesis options (for per-contact preferences)
 */
export interface SynthesisOptions {
  /** Override voice ID for this request */
  voiceId?: string;
  /** Override model ID for this request */
  modelId?: string;
  /** Override max characters for this request */
  maxCharacters?: number;
}

/**
 * Configuration for the voice synthesizer
 */
export interface VoiceSynthesizerConfig {
  /** ElevenLabs API key */
  apiKey: string;
  /** Voice ID to use (default: 'Xb7hH8MSUJpSbSDYk0k2' - a standard ElevenLabs voice) */
  voiceId?: string;
  /** Model ID to use (default: 'eleven_multilingual_v2') */
  modelId?: string;
  /** Synthesis configuration */
  synthesisConfig?: Partial<SynthesisConfig>;
}

/**
 * Voice Synthesizer using ElevenLabs API
 */
export class VoiceSynthesizer {
  private client: ElevenLabsClient;
  private voiceId: string;
  private modelId: string;
  private config: SynthesisConfig;
  private enabled: boolean;

  constructor(config: VoiceSynthesizerConfig) {
    this.client = new ElevenLabsClient({ apiKey: config.apiKey });
    this.voiceId = config.voiceId || 'Xb7hH8MSUJpSbSDYk0k2'; // Default multilingual voice
    this.modelId = config.modelId || 'eleven_multilingual_v2';
    this.config = {
      ...DEFAULT_SYNTHESIS_CONFIG,
      ...config.synthesisConfig,
    };
    this.enabled = this.config.enabled && !!config.apiKey;

    if (!config.apiKey) {
      console.warn('[VoiceSynthesizer] No API key provided, synthesis disabled');
    } else {
      console.log('[VoiceSynthesizer] Initialized with voice:', this.voiceId);
    }
  }

  /**
   * Check if synthesis is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Synthesize text to speech
   *
   * @param text - Text to synthesize
   * @param options - Optional per-request overrides (for per-contact preferences)
   * @returns Synthesis result with base64 audio data
   */
  async synthesize(text: string, options?: SynthesisOptions): Promise<SynthesisResult> {
    if (!this.enabled) {
      throw new Error('Voice synthesis is disabled');
    }

    // Defensive check for empty text
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot synthesize empty text');
    }

    // Use per-request options or fall back to defaults
    const voiceId = options?.voiceId || this.voiceId;
    const modelId = options?.modelId || this.modelId;
    const maxCharacters = options?.maxCharacters || this.config.maxCharacters;

    // Truncate text if too long (cost control)
    const truncatedText =
      text.length > maxCharacters ? text.slice(0, maxCharacters) + '...' : text;

    const startTime = Date.now();

    try {
      // Call ElevenLabs API with timeout
      const audioStream = await this.client.textToSpeech.convert(
        voiceId,
        {
          text: truncatedText,
          modelId: modelId,
          outputFormat: 'mp3_44100_128', // High quality MP3
        },
        {
          timeoutInSeconds: Math.floor(this.config.timeoutMs / 1000),
          maxRetries: 2,
        }
      );

      // Convert the ReadableStream to a buffer
      const chunks: Uint8Array[] = [];
      const reader = audioStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const buffer = Buffer.concat(chunks);

      const latency = Date.now() - startTime;
      console.log(
        `[VoiceSynthesizer] Synthesis completed in ${latency}ms, size: ${buffer.length} bytes`
      );

      return {
        base64: buffer.toString('base64'),
        mimeType: 'audio/mpeg',
        sizeBytes: buffer.length,
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      if (error instanceof Error) {
        console.error(
          `[VoiceSynthesizer] Synthesis failed after ${latency}ms:`,
          error.message
        );
        throw error;
      }

      throw new Error('Unknown synthesis error');
    }
  }
}

// Singleton instance (lazy initialization)
let synthesizer: VoiceSynthesizer | null = null;

/**
 * Get the global voice synthesizer instance
 * Creates the instance on first call
 */
export function getVoiceSynthesizer(): VoiceSynthesizer {
  if (!synthesizer) {
    const apiKey = process.env['ELEVENLABS_API_KEY'] || '';
    const enabled = process.env['VOICE_OUTPUT_ENABLED'] !== 'false';
    const voiceIdEnv = process.env['ELEVENLABS_VOICE_ID'];
    const maxCharacters = parseInt(process.env['TTS_MAX_CHARACTERS'] || '500', 10);
    const timeoutMs = parseInt(process.env['TTS_TIMEOUT_MS'] || '30000', 10);

    const config: VoiceSynthesizerConfig = {
      apiKey,
      synthesisConfig: {
        enabled,
        maxCharacters,
        timeoutMs,
      },
    };

    // Only add voiceId if explicitly set
    if (voiceIdEnv) {
      config.voiceId = voiceIdEnv;
    }

    synthesizer = new VoiceSynthesizer(config);
  }

  return synthesizer;
}

/**
 * Reset the global synthesizer instance (for testing)
 */
export function resetVoiceSynthesizer(): void {
  synthesizer = null;
}
