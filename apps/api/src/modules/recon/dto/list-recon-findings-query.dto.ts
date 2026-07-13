import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { ListReconFindingsQueryDto as ListReconFindingsShape } from '@pentesthub/shared';
import type { ReconFindingType } from '../../../prisma-types.js';

const RECON_FINDING_TYPES: ReconFindingType[] = [
  'SUBDOMAIN',
  'URL',
  'OPEN_PORT',
  'SERVICE',
  'TECHNOLOGY',
  'DNS_RECORD',
  'HTTP_HEADER',
  'CERTIFICATE',
  'SCREENSHOT',
  'SECURITY_HEADER',
  'WHOIS_RECORD',
  'ASN',
];

export class ListReconFindingsQueryParamsDto implements ListReconFindingsShape {
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

  @ApiPropertyOptional({ enum: RECON_FINDING_TYPES })
  @IsOptional()
  @IsIn(RECON_FINDING_TYPES)
  type?: ReconFindingType;
}
