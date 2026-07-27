import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type {
  AiSpeechProviderStatusDto,
  SynthesizeAiSpeechResultDto,
  TranscribeAiSpeechResultDto,
} from '@pentesthub/shared';
import { ListAiSpeechProvidersQuery } from '../queries/list-ai-speech-providers.query.js';
import { TranscribeAiSpeechDto } from '../dto/transcribe-ai-speech.dto.js';
import { SynthesizeAiSpeechDto } from '../dto/synthesize-ai-speech.dto.js';
import { TranscribeAiSpeechCommand } from '../commands/transcribe-ai-speech.command.js';
import { SynthesizeAiSpeechCommand } from '../commands/synthesize-ai-speech.command.js';

const MAX_VOICE_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

function requireAudioFile(
  file: Express.Multer.File | undefined,
): Express.Multer.File {
  if (!file) throw new BadRequestException('No audio file uploaded.');
  if (file.size > MAX_VOICE_AUDIO_SIZE_BYTES) {
    throw new BadRequestException('Audio must be smaller than 25MB.');
  }
  return file;
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/speech')
export class AiSpeechController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('providers')
  @ApiOperation({
    summary:
      'List speech (Voice Interaction) providers and whether each is configured',
  })
  listProviders(): Promise<AiSpeechProviderStatusDto[]> {
    return this.queryBus.execute(new ListAiSpeechProvidersQuery());
  }

  /// Module 11 — Voice Copilot enhancements. WEB_SPEECH is never sent
  /// here (it runs entirely client-side) — this is for the four cloud
  /// adapters, which previously had no HTTP surface at all despite being
  /// fully implemented (see TranscribeAiSpeechCommand's doc comment).
  @Post('transcribe')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('audio'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Transcribe recorded audio to text via a cloud speech provider' })
  async transcribe(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: TranscribeAiSpeechDto,
  ): Promise<TranscribeAiSpeechResultDto> {
    const audioFile = requireAudioFile(file);
    return this.commandBus.execute(
      new TranscribeAiSpeechCommand(
        dto.provider,
        audioFile.buffer,
        audioFile.mimetype,
        dto.language,
      ),
    );
  }

  @Post('synthesize')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Synthesize speech audio from text via a cloud speech provider' })
  synthesize(
    @Body() dto: SynthesizeAiSpeechDto,
  ): Promise<SynthesizeAiSpeechResultDto> {
    return this.commandBus.execute(
      new SynthesizeAiSpeechCommand(dto.provider, dto.text, dto.voice),
    );
  }
}
