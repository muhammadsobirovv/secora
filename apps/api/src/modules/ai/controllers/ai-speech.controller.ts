import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { AiSpeechProviderStatusDto } from '@pentesthub/shared';
import { ListAiSpeechProvidersQuery } from '../queries/list-ai-speech-providers.query.js';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/speech')
export class AiSpeechController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('providers')
  @ApiOperation({
    summary:
      'List speech (Voice Interaction) providers and whether each is configured',
  })
  listProviders(): Promise<AiSpeechProviderStatusDto[]> {
    return this.queryBus.execute(new ListAiSpeechProvidersQuery());
  }
}
