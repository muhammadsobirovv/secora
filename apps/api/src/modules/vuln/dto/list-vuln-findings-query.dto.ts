import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { ListVulnFindingsQueryDto as ListVulnFindingsShape } from '@pentesthub/shared';
import type {
  VulnFindingSeverity,
  VulnFindingStatus,
  VulnScanner,
} from '../../../prisma-types.js';

const VULN_SEVERITIES: VulnFindingSeverity[] = [
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

const VULN_FINDING_STATUSES: VulnFindingStatus[] = [
  'NEW',
  'CONFIRMED',
  'DUPLICATE',
  'ACCEPTED_RISK',
  'FIXED',
  'FALSE_POSITIVE',
];

const VULN_SCANNERS: VulnScanner[] = [
  'NUCLEI',
  'FFUF',
  'DIRSEARCH',
  'FEROXBUSTER',
  'NIKTO',
];

export class ListVulnFindingsQueryParamsDto implements ListVulnFindingsShape {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ enum: VULN_SEVERITIES })
  @IsOptional()
  @IsIn(VULN_SEVERITIES)
  severity?: VulnFindingSeverity;

  @ApiPropertyOptional({ enum: VULN_FINDING_STATUSES })
  @IsOptional()
  @IsIn(VULN_FINDING_STATUSES)
  status?: VulnFindingStatus;

  @ApiPropertyOptional({ enum: VULN_SCANNERS })
  @IsOptional()
  @IsIn(VULN_SCANNERS)
  scanner?: VulnScanner;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
