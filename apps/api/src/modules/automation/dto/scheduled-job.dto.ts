import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type {
  CreateScheduledJobRequestDto as CreateShape,
  ListScheduledJobsQueryDto as ListShape,
  ScheduledJobKind,
  UpdateScheduledJobRequestDto as UpdateShape,
} from '@pentesthub/shared';
import { SCHEDULED_JOB_KINDS } from '@pentesthub/shared';

export class CreateScheduledJobDto implements CreateShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;
  @ApiProperty() @IsString() @MaxLength(150) name!: string;
  @ApiProperty({ enum: SCHEDULED_JOB_KINDS }) @IsIn(SCHEDULED_JOB_KINDS) kind!: ScheduledJobKind;
  @ApiPropertyOptional() @IsOptional() @IsString() cronExpression?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() config?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateScheduledJobDto implements UpdateShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) name?: string;
  @ApiPropertyOptional({ enum: SCHEDULED_JOB_KINDS }) @IsOptional() @IsIn(SCHEDULED_JOB_KINDS) kind?: ScheduledJobKind;
  @ApiPropertyOptional() @IsOptional() @IsString() cronExpression?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() config?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class ListScheduledJobsQueryParamsDto implements ListShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;
  @ApiPropertyOptional({ enum: SCHEDULED_JOB_KINDS }) @IsOptional() @IsIn(SCHEDULED_JOB_KINDS) kind?: ScheduledJobKind;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}
