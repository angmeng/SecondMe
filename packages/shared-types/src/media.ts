/**
 * Media Types for SecondMe
 * Types for voice transcription and image understanding (Phase 4)
 */

/**
 * Result from voice transcription (Whisper API)
 */
export interface TranscriptionResult {
  /** Transcribed text */
  text: string;
  /** Detected language (ISO 639-1 code) */
  language?: string;
  /** Duration of audio in milliseconds */
  durationMs?: number;
}

/**
 * Image content block for Claude Vision API
 * Matches Anthropic's image content block format
 */
export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string; // base64 encoded image data
  };
}

/**
 * Media types for message classification
 */
export type MediaType = 'text' | 'image' | 'audio' | 'video' | 'document';

/**
 * Common MIME types for media content
 */
export type MediaMimeType =
  // Audio
  | 'audio/ogg'
  | 'audio/mpeg'
  | 'audio/mp4'
  | 'audio/wav'
  | 'audio/webm'
  // Image
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  // Video
  | 'video/mp4'
  | 'video/webm'
  // Document
  | 'application/pdf'
  // Fallback for unknown types
  | string;

/**
 * Downloaded media payload for queue
 */
export interface DownloadedMedia {
  /** Base64-encoded media content */
  base64: string;
  /** MIME type of the media */
  mimeType: string;
  /** Original file size in bytes */
  sizeBytes?: number;
}

/**
 * Configuration for voice transcription
 */
export interface TranscriptionConfig {
  /** Whether voice transcription is enabled */
  enabled: boolean;
  /** Maximum audio file size in bytes (Whisper limit is 25MB) */
  maxFileSizeBytes: number;
  /** Timeout for transcription API call in milliseconds */
  timeoutMs: number;
}

/**
 * Configuration for image processing
 */
export interface ImageProcessingConfig {
  /** Whether image processing is enabled */
  enabled: boolean;
  /** Maximum image size in bytes before resizing */
  maxSizeBytes: number;
  /** Target quality for JPEG compression (0-100) */
  jpegQuality: number;
}

/**
 * Default transcription configuration
 */
export const DEFAULT_TRANSCRIPTION_CONFIG: TranscriptionConfig = {
  enabled: true,
  maxFileSizeBytes: 25 * 1024 * 1024, // 25MB Whisper limit
  timeoutMs: 30000, // 30 seconds
};

/**
 * Default image processing configuration
 */
export const DEFAULT_IMAGE_CONFIG: ImageProcessingConfig = {
  enabled: true,
  maxSizeBytes: 5 * 1024 * 1024, // 5MB for Claude Vision
  jpegQuality: 85,
};

/**
 * Combined media limits for validation
 * Uses the larger of transcription/image limits for general validation
 */
export const DEFAULT_MEDIA_LIMITS = {
  /** Maximum file size in bytes (25MB - Whisper limit) */
  maxFileSizeBytes: 25 * 1024 * 1024,
  /** Supported audio MIME types for transcription */
  supportedAudioTypes: [
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/flac',
  ] as const,
  /** Supported image MIME types for vision */
  supportedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const,
};

/**
 * Result from voice synthesis (ElevenLabs TTS API)
 */
export interface SynthesisResult {
  /** Base64-encoded audio data */
  base64: string;
  /** MIME type of the audio (e.g., 'audio/mpeg') */
  mimeType: string;
  /** Size of audio in bytes */
  sizeBytes: number;
  /** Duration of audio in milliseconds (if available) */
  durationMs?: number;
}

/**
 * Configuration for voice synthesis
 */
export interface SynthesisConfig {
  /** Whether voice synthesis is enabled */
  enabled: boolean;
  /** Maximum characters to synthesize (cost control) */
  maxCharacters: number;
  /** Timeout for synthesis API call in milliseconds */
  timeoutMs: number;
}

/**
 * Default voice synthesis configuration
 */
export const DEFAULT_SYNTHESIS_CONFIG: SynthesisConfig = {
  enabled: true,
  maxCharacters: 500,
  timeoutMs: 30000,
};

/**
 * Per-contact voice preference for TTS output
 * Stored in Redis cache and AutoMem contact metadata
 */
export interface VoicePreference {
  /** Whether voice output is enabled for this contact */
  enabled: boolean;
  /** ElevenLabs voice ID (optional - uses default if not set) */
  voiceId?: string;
  /** TTS model ID (e.g., 'eleven_multilingual_v2') */
  modelId?: string;
  /** Maximum characters to synthesize for this contact (cost control) */
  maxCharacters?: number;
}

/**
 * Cached voice preference with metadata
 */
export interface CachedVoicePreference extends VoicePreference {
  /** Contact ID this preference belongs to */
  contactId: string;
  /** When this preference was cached */
  cachedAt: number;
}

/**
 * Type guard for VoicePreference
 */
export function isVoicePreference(obj: unknown): obj is VoicePreference {
  if (typeof obj !== 'object' || obj === null) return false;
  const pref = obj as Record<string, unknown>;
  return typeof pref['enabled'] === 'boolean';
}
