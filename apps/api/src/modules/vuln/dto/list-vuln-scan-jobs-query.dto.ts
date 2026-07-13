import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { ListVulnScanJobsQueryDto as ListVulnScanJobsShape } from '@pentesthub/shared';
import type { VulnScanJobStatus } from '../../../prisma-types.js';

const VULN_SCAN_JOB_STATUSES: VulnScanJobStatus[] = [
  'PENDING',
  'RUNNING',
  'PAUSED',
  'RETRYING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

export class ListVulnScanJobsQueryParamsDto implements ListVulnScanJobsShape {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ enum: VULN_SCAN_JOB_STATUSES })
  @IsOptional()
  @IsIn(VULN_SCAN_JOB_STATUSES)
  status?: VulnScanJobStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
