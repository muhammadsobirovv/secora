import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import type { ListPromptTemplatesQueryDto as ListPromptTemplatesShape } from '@pentesthub/shared';

export class ListPromptTemplatesQueryParamsDto implements ListPromptTemplatesShape {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
