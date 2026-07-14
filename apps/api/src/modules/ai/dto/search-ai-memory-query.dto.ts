import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import type { AiMemorySourceType } from '@pentesthub/shared';

const AI_MEMORY_SOURCE_TYPES: AiMemorySourceType[] = [
  'FINDING',
  'RECON_FINDING',
  'NOTE',
  'EVIDENCE',
  'CONVERSATION_MESSAGE',
  'SCAN_TEMPLATE',
  'TARGET',
  'PROJECT',
  'CUSTOM',
];

export class SearchAiMemoryQueryParamsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  q!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: AI_MEMORY_SOURCE_TYPES })
  @IsOptional()
  @IsIn(AI_MEMORY_SOURCE_TYPES)
  sourceType?: AiMemorySourceType;
}
