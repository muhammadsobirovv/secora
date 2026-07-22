import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import type { AnalyticsQueryDto as AnalyticsShape } from '@pentesthub/shared';

export class AnalyticsQueryParamsDto implements AnalyticsShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date-time, inclusive lower bound on createdAt' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date-time, inclusive upper bound on createdAt' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
