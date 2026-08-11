import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type {
  ClaimJobRequestDto as ClaimJobShape,
  CompleteJobRequestDto as CompleteJobShape,
  DistributedJobPriority,
  DistributedJobStatus,
  EnqueueDistributedJobRequestDto as EnqueueJobShape,
  FailJobRequestDto as FailJobShape,
  ListDistributedJobsQueryDto as ListJobsShape,
  RegisterWorkerNodeRequestDto as RegisterWorkerShape,
} from '@pentesthub/shared';

const JOB_PRIORITIES: DistributedJobPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
const JOB_STATUSES: DistributedJobStatus[] = ['QUEUED', 'ASSIGNED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'RETRYING'];

export class RegisterWorkerNodeDto implements RegisterWorkerShape {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty() @IsString() @MaxLength(255) hostname!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) capabilities!: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(256) maxConcurrency?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) version?: string;
}

export class EnqueueDistributedJobDto implements EnqueueJobShape {
  @ApiProperty() @IsString() @MaxLength(120) type!: string;
  @ApiProperty({ type: Object }) @IsObject() payload!: Record<string, unknown>;
  @ApiPropertyOptional({ enum: JOB_PRIORITIES }) @IsOptional() @IsIn(JOB_PRIORITIES) priority?: DistributedJobPriority;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(20) maxAttempts?: number;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() scheduledFor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
}

export class ClaimJobsDto implements ClaimJobShape {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) capabilities!: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) maxJobs?: number;
}

export class CompleteJobDto implements CompleteJobShape {
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() output?: Record<string, unknown>;
}

export class FailJobDto implements FailJobShape {
  @ApiProperty() @IsString() @MaxLength(4000) error!: string;
}

export class ListDistributedJobsQueryParamsDto implements ListJobsShape {
  @ApiPropertyOptional({ enum: JOB_STATUSES }) @IsOptional() @IsIn(JOB_STATUSES) status?: DistributedJobStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
}

export class HeartbeatWorkerNodeDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) currentLoad?: number;
  // Module 14 — Auto Update: lets a worker report a version bump on a
  // live heartbeat (e.g. a rolling restart onto a new image) without
  // needing a full re-register.
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) version?: string;
}
