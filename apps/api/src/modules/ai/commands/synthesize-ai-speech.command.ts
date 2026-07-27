import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import type { AiSpeechProviderName, SynthesizeAiSpeechResultDto } from '@pentesthub/shared';
import { AiSpeechProviderRegistryService } from '../speech/ai-speech-provider-registry.service.js';
import { toSpeechAppException } from './transcribe-ai-speech.command.js';

/// Module 11 — Voice Copilot enhancements: the synthesize half — see
/// TranscribeAiSpeechCommand's doc comment.
export class SynthesizeAiSpeechCommand implements ICommand {
  constructor(
    public readonly provider: AiSpeechProviderName,
    public readonly text: string,
    public readonly voice?: string,
  ) {}
}

@CommandHandler(SynthesizeAiSpeechCommand)
export class SynthesizeAiSpeechHandler implements ICommandHandler<
  SynthesizeAiSpeechCommand,
  SynthesizeAiSpeechResultDto
> {
  constructor(private readonly speechRegistry: AiSpeechProviderRegistryService) {}

  async execute(
    command: SynthesizeAiSpeechCommand,
  ): Promise<SynthesizeAiSpeechResultDto> {
    const provider = this.speechRegistry.get(command.provider);
    try {
      const result = await provider.synthesize({
        text: command.text,
        voice: command.voice,
      });
      return {
        audioBase64: result.audio.toString('base64'),
        mimeType: result.mimeType,
      };
    } catch (error) {
      throw toSpeechAppException(error);
    }
  }
}
