import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AI_SPEECH_PROVIDER_NAMES } from '@pentesthub/shared';
import type { SynthesizeAiSpeechRequestDto as SynthesizeAiSpeechShape } from '@pentesthub/shared';

export class SynthesizeAiSpeechDto implements SynthesizeAiSpeechShape {
  @ApiProperty({ enum: AI_SPEECH_PROVIDER_NAMES })
  @IsIn(AI_SPEECH_PROVIDER_NAMES)
  provider!: SynthesizeAiSpeechShape['provider'];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voice?: string;
}
