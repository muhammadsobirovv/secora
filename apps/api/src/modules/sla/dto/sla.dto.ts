import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import type { UpsertSlaPolicyRequestDto, VulnFindingSeverity } from '@pentesthub/shared';

const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/// Module 17 — task #478 (SLA Engine, spec section 23).
export class UpsertSlaPolicyDto implements UpsertSlaPolicyRequestDto {
  @ApiProperty({ enum: SEVERITIES }) @IsIn(SEVERITIES) severity!: VulnFindingSeverity;
  @ApiProperty() @IsInt() @IsPositive() targetHours!: number;
}

export class ListSlaEventsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() incidentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() findingId?: string;
  @ApiPropertyOptional({ description: 'Only currently-breached events' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  breachedOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}
