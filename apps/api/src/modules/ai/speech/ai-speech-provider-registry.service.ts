import { Injectable } from '@nestjs/common';
import type { AiSpeechProviderName } from '@pentesthub/shared';
import { AI_SPEECH_PROVIDER_NAMES } from '@pentesthub/shared';
import type { SpeechProvider } from './speech-provider.interface.js';
import { WebSpeechProvider } from './adapters/web-speech.provider.js';
import { OpenAiSpeechProvider } from './adapters/openai-speech.provider.js';
import { AzureSpeechProvider } from './adapters/azure-speech.provider.js';
import { GoogleSpeechProvider } from './adapters/google-speech.provider.js';
import { ElevenLabsProvider } from './adapters/elevenlabs.provider.js';

export interface AiSpeechProviderStatus {
  provider: AiSpeechProviderName;
  configured: boolean;
  capabilities: SpeechProvider['capabilities'];
}

/// Same "constructor injection + Map" registry pattern as
/// AiProviderRegistryService (providers/ai-provider-registry.service.ts) —
/// adding a 6th speech backend later means one new adapter class and one
/// constructor line, nothing else in the module changes.
@Injectable()
export class AiSpeechProviderRegistryService {
  private readonly providers: Map<AiSpeechProviderName, SpeechProvider>;

  constructor(
    webSpeechProvider: WebSpeechProvider,
    openAiSpeechProvider: OpenAiSpeechProvider,
    azureSpeechProvider: AzureSpeechProvider,
    googleSpeechProvider: GoogleSpeechProvider,
    elevenLabsProvider: ElevenLabsProvider,
  ) {
    this.providers = new Map<AiSpeechProviderName, SpeechProvider>([
      ['WEB_SPEECH', webSpeechProvider],
      ['OPENAI_SPEECH', openAiSpeechProvider],
      ['AZURE_SPEECH', azureSpeechProvider],
      ['GOOGLE_SPEECH', googleSpeechProvider],
      ['ELEVENLABS', elevenLabsProvider],
    ]);
  }

  get(name: AiSpeechProviderName): SpeechProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown speech provider "${name}"`);
    return provider;
  }

  listStatuses(): AiSpeechProviderStatus[] {
    return AI_SPEECH_PROVIDER_NAMES.map((name) => {
      const provider = this.get(name);
      return {
        provider: name,
        configured: provider.isConfigured(),
        capabilities: provider.capabilities,
      };
    });
  }
}
