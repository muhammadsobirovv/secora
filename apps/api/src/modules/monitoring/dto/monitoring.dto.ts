import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { CreateMonitoringJobRequestDto, MonitoringTrigger } from '@pentesthub/shared';

const TRIGGERS = ['SCHEDULED', 'MANUAL', 'EVENT_TRIGGERED'] as const;

/// Module 17 — task #463 (Continuous Attack Surface Monitoring). Validates
/// `cronExpression` is present for a SCHEDULED trigger at the DTO layer
/// (a clear 400 beats a job silently never running because `nextRunAt`
/// could never be computed) — see `ContinuousMonitoringService.create`
/// for the actual `computeNextRunAt` call this enables.
export class CreateMonitoringJobDto implements CreateMonitoringJobRequestDto {
  @ApiProperty() @IsString() projectId!: string;
  @ApiProperty() @IsString() targetId!: string;
  @ApiProperty({ enum: TRIGGERS }) @IsIn(TRIGGERS) trigger!: MonitoringTrigger;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) cronExpression?: string;
}

export class UpdateMonitoringJobDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) cronExpression?: string;
}
