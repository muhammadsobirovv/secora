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

const DEFAULT_LANGUAGE = 'en-US';
const DEFAULT_VOICE = 'en-US-JennyNeural';

/// Derives the BCP-47 locale ("uz-UZ") from an Azure neural voice name
/// ("uz-UZ-MadinaNeural"). Falls back to en-US for unexpected names.
function voiceLocale(voice: string): string {
  const match = /^([a-z]{2,3}-[A-Za-z]{2,4})-/.exec(voice);
  return match ? match[1] : DEFAULT_LANGUAGE;
}

function escapeSsml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/// Azure Cognitive Services Speech — both the short-audio
/// speech-to-text REST endpoint and the speech-synthesis REST endpoint are
/// region-scoped (AI_SPEECH_AZURE_REGION), unlike OpenAI/Google/ElevenLabs
/// which use one global URL — configured requires both the key and the
/// region.
@Injectable()
export class AzureSpeechProvider implements SpeechProvider {
  readonly name = 'AZURE_SPEECH' as const;
  readonly capabilities = ['transcribe', 'synthesize'] as const as (
    'transcribe' | 'synthesize'
  )[];

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  private getApiKey(): string | undefined {
    return this.configService.get('AI_SPEECH_AZURE_API_KEY', { infer: true });
  }

  private getRegion(): string | undefined {
    return this.configService.get('AI_SPEECH_AZURE_REGION', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey() && this.getRegion());
  }

  async transcribe(options: AiSpeechTranscribeOptions): Promise<string> {
    const apiKey = this.getApiKey();
    const region = this.getRegion();
    if (!apiKey || !region)
      throw new SpeechProviderNotConfiguredError(this.name);

    const language = options.language ?? DEFAULT_LANGUAGE;
    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(language)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': `${options.mimeType}; codecs=audio/pcm; samplerate=16000`,
        Accept: 'application/json',
      },
      body: bufferToArrayBuffer(options.audio),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SpeechProviderRequestError(
        this.name,
        `Azure Speech transcription failed (${response.status}): ${text}`,
      );
    }

    const data = (await response.json()) as { DisplayText?: string };
    return data.DisplayText ?? '';
  }

  async synthesize(
    options: AiSpeechSynthesizeOptions,
  ): Promise<AiSpeechSynthesisResult> {
    const apiKey = this.getApiKey();
    const region = this.getRegion();
    if (!apiKey || !region)
      throw new SpeechProviderNotConfiguredError(this.name);

    const voice = options.voice ?? DEFAULT_VOICE;
    // Azure voice names are "<locale>-<Name>Neural" (e.g. "uz-UZ-MadinaNeural"),
    // so the SSML xml:lang is derived from the voice to keep pronunciation
    // matched to the language (Uzbek, Russian, English).
    const locale = voiceLocale(voice);
    const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const ssml = `<speak version="1.0" xml:lang="${escapeSsml(locale)}"><voice xml:lang="${escapeSsml(locale)}" name="${escapeSsml(voice)}">${escapeSsml(options.text)}</voice></speak>`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-64kbitrate-mono-mp3',
      },
      body: ssml,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SpeechProviderRequestError(
        this.name,
        `Azure Speech synthesis failed (${response.status}): ${text}`,
      );
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return { audio, mimeType: 'audio/mpeg' };
  }
}
