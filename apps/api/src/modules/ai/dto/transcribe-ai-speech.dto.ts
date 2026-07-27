import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AI_SPEECH_PROVIDER_NAMES } from '@pentesthub/shared';
import type { TranscribeAiSpeechRequestDto as TranscribeAiSpeechShape } from '@pentesthub/shared';

export class TranscribeAiSpeechDto implements TranscribeAiSpeechShape {
  @ApiProperty({ enum: AI_SPEECH_PROVIDER_NAMES })
  @IsIn(AI_SPEECH_PROVIDER_NAMES)
  provider!: TranscribeAiSpeechShape['provider'];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;
}
