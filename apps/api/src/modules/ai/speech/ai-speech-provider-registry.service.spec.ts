import { describe, expect, it } from '@jest/globals';
import type { AiSpeechProviderName } from '@pentesthub/shared';
import type {
  AiSpeechSynthesisResult,
  AiSpeechSynthesizeOptions,
  AiSpeechTranscribeOptions,
  SpeechProvider,
} from './speech-provider.interface.js';
import { AiSpeechProviderRegistryService } from './ai-speech-provider-registry.service.js';
import type { WebSpeechProvider } from './adapters/web-speech.provider.js';
import type { OpenAiSpeechProvider } from './adapters/openai-speech.provider.js';
import type { AzureSpeechProvider } from './adapters/azure-speech.provider.js';
import type { GoogleSpeechProvider } from './adapters/google-speech.provider.js';
import type { ElevenLabsProvider } from './adapters/elevenlabs.provider.js';

function fakeProvider(
  name: AiSpeechProviderName,
  configured: boolean,
  capabilities: ('transcribe' | 'synthesize')[] = ['transcribe', 'synthesize'],
): SpeechProvider {
  return {
    name,
    capabilities,
    isConfigured: () => configured,
    transcribe: (_options: AiSpeechTranscribeOptions): Promise<string> =>
      Promise.resolve('transcribed'),
    synthesize: (
      _options: AiSpeechSynthesizeOptions,
    ): Promise<AiSpeechSynthesisResult> =>
      Promise.resolve({ audio: Buffer.from(''), mimeType: 'audio/mpeg' }),
  };
}

function buildRegistry(
  configured: Partial<Record<AiSpeechProviderName, boolean>>,
) {
  const flags: Record<AiSpeechProviderName, boolean> = {
    WEB_SPEECH: true,
    OPENAI_SPEECH: false,
    AZURE_SPEECH: false,
    GOOGLE_SPEECH: false,
    ELEVENLABS: false,
    ...configured,
  };

  return new AiSpeechProviderRegistryService(
    fakeProvider(
      'WEB_SPEECH',
      flags.WEB_SPEECH,
    ) as unknown as WebSpeechProvider,
    fakeProvider(
      'OPENAI_SPEECH',
      flags.OPENAI_SPEECH,
    ) as unknown as OpenAiSpeechProvider,
    fakeProvider(
      'AZURE_SPEECH',
      flags.AZURE_SPEECH,
    ) as unknown as AzureSpeechProvider,
    fakeProvider(
      'GOOGLE_SPEECH',
      flags.GOOGLE_SPEECH,
    ) as unknown as GoogleSpeechProvider,
    fakeProvider('ELEVENLABS', flags.ELEVENLABS, [
      'synthesize',
    ]) as unknown as ElevenLabsProvider,
  );
}

describe('AiSpeechProviderRegistryService', () => {
  it('get() returns the adapter for a known provider name', () => {
    const registry = buildRegistry({});
    expect(registry.get('ELEVENLABS').name).toBe('ELEVENLABS');
  });

  it('get() throws for an unknown provider name', () => {
    const registry = buildRegistry({});
    expect(() =>
      registry.get('not_a_real_provider' as AiSpeechProviderName),
    ).toThrow();
  });

  it('listStatuses() reports configured + capabilities for every provider, WEB_SPEECH always configured', () => {
    const registry = buildRegistry({ OPENAI_SPEECH: true });
    const statuses = registry.listStatuses();
    expect(statuses).toHaveLength(5);

    const webSpeech = statuses.find((s) => s.provider === 'WEB_SPEECH');
    expect(webSpeech).toEqual({
      provider: 'WEB_SPEECH',
      configured: true,
      capabilities: ['transcribe', 'synthesize'],
    });

    const openAi = statuses.find((s) => s.provider === 'OPENAI_SPEECH');
    expect(openAi?.configured).toBe(true);

    const elevenLabs = statuses.find((s) => s.provider === 'ELEVENLABS');
    expect(elevenLabs).toEqual({
      provider: 'ELEVENLABS',
      configured: false,
      capabilities: ['synthesize'],
    });
  });
});
