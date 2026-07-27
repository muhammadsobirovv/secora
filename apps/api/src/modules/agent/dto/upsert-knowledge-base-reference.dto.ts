import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import type {
  KnowledgeBaseReferenceFramework,
  UpsertKnowledgeBaseReferenceEntryRequestDto as UpsertKnowledgeBaseReferenceEntryShape,
} from '@pentesthub/shared';
import { KNOWLEDGE_BASE_REFERENCE_FRAMEWORKS } from '@pentesthub/shared';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
export class UpsertKnowledgeBaseReferenceDto implements UpsertKnowledgeBaseReferenceEntryShape {
  @ApiProperty({ enum: KNOWLEDGE_BASE_REFERENCE_FRAMEWORKS })
  @IsIn(KNOWLEDGE_BASE_REFERENCE_FRAMEWORKS)
  framework!: KnowledgeBaseReferenceFramework;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  summary!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
