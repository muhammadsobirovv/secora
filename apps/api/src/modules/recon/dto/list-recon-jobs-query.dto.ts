import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { ListReconJobsQueryDto as ListReconJobsShape } from '@pentesthub/shared';
import type { ReconJobStatus } from '../../../prisma-types.js';

const RECON_JOB_STATUSES: ReconJobStatus[] = [
  'PENDING',
  'RUNNING',
  'RETRYING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

export class ListReconJobsQueryParamsDto implements ListReconJobsShape {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ enum: RECON_JOB_STATUSES })
  @IsOptional()
  @IsIn(RECON_JOB_STATUSES)
  status?: ReconJobStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
