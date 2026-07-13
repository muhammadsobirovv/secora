import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { UpdateVulnFindingStatusRequestDto as UpdateVulnFindingStatusShape } from '@pentesthub/shared';
import type { VulnFindingStatus } from '../../../prisma-types.js';

export const VULN_FINDING_STATUSES: VulnFindingStatus[] = [
  'NEW',
  'CONFIRMED',
  'DUPLICATE',
  'ACCEPTED_RISK',
  'FIXED',
  'FALSE_POSITIVE',
];

export class UpdateVulnFindingStatusDto implements UpdateVulnFindingStatusShape {
  @ApiProperty({ enum: VULN_FINDING_STATUSES })
  @IsIn(VULN_FINDING_STATUSES)
  status!: VulnFindingStatus;
}
