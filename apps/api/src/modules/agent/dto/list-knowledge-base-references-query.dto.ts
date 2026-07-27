import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { KnowledgeBaseReferenceFramework } from '@pentesthub/shared';
import { KNOWLEDGE_BASE_REFERENCE_FRAMEWORKS } from '@pentesthub/shared';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
export class ListKnowledgeBaseReferencesQueryParamsDto {
  @ApiPropertyOptional({ enum: KNOWLEDGE_BASE_REFERENCE_FRAMEWORKS })
  @IsOptional()
  @IsIn(KNOWLEDGE_BASE_REFERENCE_FRAMEWORKS)
  framework?: KnowledgeBaseReferenceFramework;

  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class SearchKnowledgeBaseReferencesQueryParamsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  query!: string;

  @ApiPropertyOptional({ enum: KNOWLEDGE_BASE_REFERENCE_FRAMEWORKS })
  @IsOptional()
  @IsIn(KNOWLEDGE_BASE_REFERENCE_FRAMEWORKS)
  framework?: KnowledgeBaseReferenceFramework;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
