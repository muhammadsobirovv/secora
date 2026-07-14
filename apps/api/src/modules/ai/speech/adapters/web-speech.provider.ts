import { Injectable } from '@nestjs/common';
import type {
  AiSpeechSynthesisResult,
  AiSpeechSynthesizeOptions,
  AiSpeechTranscribeOptions,
  SpeechProvider,
} from '../speech-provider.interface.js';
import { SpeechProviderRequestError } from '../speech-provider.interface.js';

/// Documented marker for the browser's built-in Web Speech API
/// (SpeechRecognition + speechSynthesis) — always "configured" since it
/// needs no API key, but structurally cannot run server-side: it has no
/// network client, no key, and nothing to `fetch()`. The actual
/// implementation lives entirely in the frontend
/// (apps/web/features/ai/hooks/use-ai-voice.ts) and never calls this
/// class or any `/ai/speech/*` endpoint. This adapter exists purely so
/// `GET /ai/speech/providers` can list "Browser (Web Speech API)" as an
/// always-available option alongside the cloud adapters, consistent with
/// ADR 0005's "list every provider up front" philosophy.
@Injectable()
export class WebSpeechProvider implements SpeechProvider {
  readonly name = 'WEB_SPEECH' as const;
  readonly capabilities = ['transcribe', 'synthesize'] as const as (
    'transcribe' | 'synthesize'
  )[];

  isConfigured(): boolean {
    return true;
  }

  transcribe(_options: AiSpeechTranscribeOptions): Promise<string> {
    return Promise.reject(
      new SpeechProviderRequestError(
        this.name,
        'WEB_SPEECH runs entirely in the browser (Web Speech API) — it has no server-side implementation to call.',
      ),
    );
  }

  synthesize(
    _options: AiSpeechSynthesizeOptions,
  ): Promise<AiSpeechSynthesisResult> {
    return Promise.reject(
      new SpeechProviderRequestError(
        this.name,
        'WEB_SPEECH runs entirely in the browser (Web Speech API) — it has no server-side implementation to call.',
      ),
    );
  }
}
