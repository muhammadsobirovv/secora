import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { TranscribeAiSpeechResultDto, AiSpeechProviderName } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { AiSpeechProviderRegistryService } from '../speech/ai-speech-provider-registry.service.js';
import {
  SpeechProviderCapabilityError,
  SpeechProviderNotConfiguredError,
  SpeechProviderRequestError,
} from '../speech/speech-provider.interface.js';

/// Module 11 — Voice Copilot enhancements: the transcribe half of the
/// previously-unreachable cloud SpeechProvider adapters (see
/// TranscribeAiSpeechResultDto's doc comment in packages/shared/src/ai.ts
/// for the full "why this exists" context).
export class TranscribeAiSpeechCommand implements ICommand {
  constructor(
    public readonly provider: AiSpeechProviderName,
    public readonly audio: Buffer,
    public readonly mimeType: string,
    public readonly language?: string,
  ) {}
}

@CommandHandler(TranscribeAiSpeechCommand)
export class TranscribeAiSpeechHandler implements ICommandHandler<
  TranscribeAiSpeechCommand,
  TranscribeAiSpeechResultDto
> {
  constructor(private readonly speechRegistry: AiSpeechProviderRegistryService) {}

  async execute(
    command: TranscribeAiSpeechCommand,
  ): Promise<TranscribeAiSpeechResultDto> {
    const provider = this.speechRegistry.get(command.provider);
    try {
      const text = await provider.transcribe({
        audio: command.audio,
        mimeType: command.mimeType,
        language: command.language,
      });
      return { text };
    } catch (error) {
      throw toSpeechAppException(error);
    }
  }
}

export function toSpeechAppException(error: unknown): AppException {
  if (
    error instanceof SpeechProviderNotConfiguredError ||
    error instanceof SpeechProviderCapabilityError ||
    error instanceof SpeechProviderRequestError
  ) {
    return new AppException(
      'SPEECH_PROVIDER_ERROR',
      error.message,
      HttpStatus.BAD_REQUEST,
    );
  }
  const message = error instanceof Error ? error.message : 'Speech request failed.';
  return new AppException('SPEECH_PROVIDER_ERROR', message, HttpStatus.BAD_REQUEST);
}
