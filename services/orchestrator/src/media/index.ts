/**
 * Media Module
 * Voice transcription and image processing for Phase 4
 * Voice synthesis (TTS) for Phase 5
 */

export { VoiceTranscriber, getVoiceTranscriber, resetVoiceTranscriber } from './transcriber.js';
export type { VoiceTranscriberConfig } from './transcriber.js';

export { VoiceSynthesizer, getVoiceSynthesizer, resetVoiceSynthesizer } from './synthesizer.js';
export type { VoiceSynthesizerConfig } from './synthesizer.js';
