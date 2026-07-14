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
  SpeechProviderCapabilityError,
  SpeechProviderNotConfiguredError,
  SpeechProviderRequestError,
} from '../speech-provider.interface.js';

const SPEECH_URL_TEMPLATE = 'https://api.elevenlabs.io/v1/text-to-speech/';

/// ElevenLabs is TTS-only — there is no transcription API — so
/// `capabilities` reports just `["synthesize"]` and `transcribe()` throws
/// SpeechProviderCapabilityError rather than a generic error, letting
/// callers distinguish "wrong provider for this" from "not configured".
@Injectable()
export class ElevenLabsProvider implements SpeechProvider {
  readonly name = 'ELEVENLABS' as const;
  readonly capabilities = ['synthesize'] as const as (
    'transcribe' | 'synthesize'
  )[];

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  private getApiKey(): string | undefined {
    return this.configService.get('AI_SPEECH_ELEVENLABS_API_KEY', {
      infer: true,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  transcribe(_options: AiSpeechTranscribeOptions): Promise<string> {
    return Promise.reject(
      new SpeechProviderCapabilityError(this.name, 'transcribe'),
    );
  }

  async synthesize(
    options: AiSpeechSynthesizeOptions,
  ): Promise<AiSpeechSynthesisResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new SpeechProviderNotConfiguredError(this.name);

    const voiceId =
      options.voice ??
      this.configService.get('AI_SPEECH_ELEVENLABS_VOICE_ID', {
        infer: true,
      });

    const response = await fetch(`${SPEECH_URL_TEMPLATE}${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: options.text,
        model_id: 'eleven_multilingual_v2',
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SpeechProviderRequestError(
        this.name,
        `ElevenLabs synthesis failed (${response.status}): ${text}`,
      );
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return { audio, mimeType: 'audio/mpeg' };
  }
}
