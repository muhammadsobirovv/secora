import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { CreateAiConversationRequestDto as CreateAiConversationShape } from '@pentesthub/shared';
import { AI_PROVIDER_NAMES } from '@pentesthub/shared';
import type { AiProviderName } from '@pentesthub/shared';

export class CreateAiConversationDto implements CreateAiConversationShape {
  @ApiProperty()
  @IsUUID()
  projectId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: AI_PROVIDER_NAMES })
  @IsOptional()
  @IsIn(AI_PROVIDER_NAMES)
  provider?: AiProviderName;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;
}
