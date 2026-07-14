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
import { bufferToArrayBuffer } from '../buffer-to-array-buffer.util.js';

const TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
const SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const TRANSCRIBE_MODEL = 'whisper-1';
const TTS_MODEL = 'tts-1';
const DEFAULT_VOICE = 'alloy';

/// Reuses AI_OPENAI_API_KEY (same OpenAI account as the chat adapter) —
/// Whisper (transcription) and the TTS endpoint are both plain OpenAI
/// REST APIs, not a separate product needing its own key.
@Injectable()
export class OpenAiSpeechProvider implements SpeechProvider {
  readonly name = 'OPENAI_SPEECH' as const;
  readonly capabilities = ['transcribe', 'synthesize'] as const as (
    'transcribe' | 'synthesize'
  )[];

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  private getApiKey(): string | undefined {
    return this.configService.get('AI_OPENAI_API_KEY', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  async transcribe(options: AiSpeechTranscribeOptions): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new SpeechProviderNotConfiguredError(this.name);

    const form = new FormData();
    form.append(
      'file',
      new Blob([bufferToArrayBuffer(options.audio)], {
        type: options.mimeType,
      }),
      'audio',
    );
    form.append('model', TRANSCRIBE_MODEL);
    if (options.language) form.append('language', options.language);

    const response = await fetch(TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SpeechProviderRequestError(
        this.name,
        `OpenAI transcription failed (${response.status}): ${text}`,
      );
    }

    const data = (await response.json()) as { text: string };
    return data.text;
  }

  async synthesize(
    options: AiSpeechSynthesizeOptions,
  ): Promise<AiSpeechSynthesisResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new SpeechProviderNotConfiguredError(this.name);

    const response = await fetch(SPEECH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: options.text,
        voice: options.voice ?? DEFAULT_VOICE,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SpeechProviderRequestError(
        this.name,
        `OpenAI speech synthesis failed (${response.status}): ${text}`,
      );
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return { audio, mimeType: 'audio/mpeg' };
  }
}
