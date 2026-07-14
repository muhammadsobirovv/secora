import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../../config/env.validation.js';
import type {
  AiSpeechSynthesisResult,
  AiSpeechSynthesizeOptions,
  AiSpeechTranscribeOptions,
  SpeechProvider,
} from '../speech-provider.interface.js';
import {
  SpeechProviderNotConfiguredError,
  SpeechProviderRequestError,
} from '../speech-provider.interface.js';

const SPEECH_TO_TEXT_URL = 'https://speech.googleapis.com/v1/speech:recognize';
const TEXT_TO_SPEECH_URL =
  'https://texttospeech.googleapis.com/v1/text:synthesize';
const DEFAULT_LANGUAGE = 'en-US';
const DEFAULT_VOICE = 'en-US-Neural2-C';

/// Google Cloud Speech-to-Text / Text-to-Speech, authenticated via a
/// simple API-key query param (rather than OAuth service-account JSON) to
/// keep configuration a single env var, same shape as the other adapters.
@Injectable()
export class GoogleSpeechProvider implements SpeechProvider {
  readonly name = 'GOOGLE_SPEECH' as const;
  readonly capabilities = ['transcribe', 'synthesize'] as const as (
    'transcribe' | 'synthesize'
  )[];

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  private getApiKey(): string | undefined {
    return this.configService.get('AI_SPEECH_GOOGLE_API_KEY', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  async transcribe(options: AiSpeechTranscribeOptions): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new SpeechProviderNotConfiguredError(this.name);

    const response = await fetch(`${SPEECH_TO_TEXT_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          languageCode: options.language ?? DEFAULT_LANGUAGE,
        },
        audio: { content: options.audio.toString('base64') },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SpeechProviderRequestError(
        this.name,
        `Google Speech-to-Text failed (${response.status}): ${text}`,
      );
    }

    const data = (await response.json()) as {
      results?: { alternatives?: { transcript?: string }[] }[];
    };
    return (
      data.results
        ?.map((r) => r.alternatives?.[0]?.transcript ?? '')
        .join(' ')
        .trim() ?? ''
    );
  }

  async synthesize(
    options: AiSpeechSynthesizeOptions,
  ): Promise<AiSpeechSynthesisResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new SpeechProviderNotConfiguredError(this.name);

    const voice = options.voice ?? DEFAULT_VOICE;
    const response = await fetch(`${TEXT_TO_SPEECH_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: options.text },
        voice: { languageCode: DEFAULT_LANGUAGE, name: voice },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SpeechProviderRequestError(
        this.name,
        `Google Text-to-Speech failed (${response.status}): ${text}`,
      );
    }

    const data = (await response.json()) as { audioContent?: string };
    const audio = Buffer.from(data.audioContent ?? '', 'base64');
    return { audio, mimeType: 'audio/mpeg' };
  }
}
