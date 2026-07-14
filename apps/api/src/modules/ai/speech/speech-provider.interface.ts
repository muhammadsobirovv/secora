import type { AiSpeechProviderName } from '@pentesthub/shared';

/// What a speech adapter can actually do — ElevenLabs, for example, is
/// TTS-only (no transcription API), so `SpeechProvider.capabilities` lets
/// the registry/frontend know which of transcribe/synthesize are real
/// before ever calling one (rather than discovering it via a thrown
/// error). Mirrors the "list configured status up front" philosophy of
/// AiProvider (ai-provider.interface.ts) applied to voice (Voice
/// Interaction, ADR 0005 Phase 2).
export type AiSpeechCapability = 'transcribe' | 'synthesize';

export interface AiSpeechTranscribeOptions {
  /// Raw audio bytes captured by the caller (e.g. a recorded WebM/Opus
  /// blob from the browser's MediaRecorder).
  audio: Buffer;
  mimeType: string;
  /// BCP-47 language hint (e.g. "en-US"); optional — most providers can
  /// auto-detect, this just improves accuracy when known.
  language?: string;
}

export interface AiSpeechSynthesizeOptions {
  text: string;
  /// Provider-specific voice identifier; each adapter documents/defaults
  /// its own when omitted.
  voice?: string;
}

export interface AiSpeechSynthesisResult {
  audio: Buffer;
  mimeType: string;
}

/// Thrown when a speech provider is asked to do work while unconfigured —
/// same "never fail at boot, only on actual use" contract as
/// AiProviderNotConfiguredError.
export class SpeechProviderNotConfiguredError extends Error {
  constructor(public readonly provider: AiSpeechProviderName) {
    super(
      `Speech provider "${provider}" is not configured — missing API key or endpoint.`,
    );
    this.name = 'SpeechProviderNotConfiguredError';
  }
}

/// Thrown when a provider is asked for a capability it structurally does
/// not have (e.g. transcribe() on a TTS-only adapter like ElevenLabs) —
/// distinct from "not configured" so callers/UIs can tell "add a key" from
/// "pick a different provider for this" apart.
export class SpeechProviderCapabilityError extends Error {
  constructor(
    public readonly provider: AiSpeechProviderName,
    public readonly capability: AiSpeechCapability,
  ) {
    super(`Speech provider "${provider}" does not support "${capability}".`);
    this.name = 'SpeechProviderCapabilityError';
  }
}

export class SpeechProviderRequestError extends Error {
  constructor(
    public readonly provider: AiSpeechProviderName,
    message: string,
  ) {
    super(message);
    this.name = 'SpeechProviderRequestError';
  }
}

/// One adapter per supported speech backend (Voice Interaction). The
/// built-in `WEB_SPEECH` adapter is a documented marker only — actual
/// speech recognition/synthesis for it runs entirely in the browser via
/// the Web Speech API (see apps/web/features/ai/hooks/use-ai-voice.ts);
/// it is never actually invoked server-side. The four cloud adapters
/// (OpenAI, Azure, Google, ElevenLabs) are real `fetch()`-based clients,
/// each `isConfigured(): false` until the project owner supplies keys —
/// same "ships complete, wired later" posture as the five AiProvider chat
/// adapters (ADR 0005).
export interface SpeechProvider {
  readonly name: AiSpeechProviderName;
  readonly capabilities: AiSpeechCapability[];
  isConfigured(): boolean;
  transcribe(options: AiSpeechTranscribeOptions): Promise<string>;
  synthesize(
    options: AiSpeechSynthesizeOptions,
  ): Promise<AiSpeechSynthesisResult>;
}
