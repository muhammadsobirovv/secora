import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/// Module 17 — task #479 (Security Metrics).
export class SecurityMetricsSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Lookback window in days', default: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  windowDays?: number;
}

export class SecurityMetricsTrendQueryDto {
  @ApiPropertyOptional({ description: 'Number of trailing weekly buckets', default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  weeks?: number;
}
