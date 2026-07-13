import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsIn,
  IsUUID,
} from 'class-validator';
import type { BulkUpdateVulnFindingsRequestDto as BulkUpdateVulnFindingsShape } from '@pentesthub/shared';
import type { VulnFindingStatus } from '../../../prisma-types.js';
import { VULN_FINDING_STATUSES } from './update-vuln-finding-status.dto.js';

export class BulkUpdateVulnFindingsDto implements BulkUpdateVulnFindingsShape {
  @ApiProperty({ type: [String] })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  findingIds!: string[];

  @ApiProperty({ enum: VULN_FINDING_STATUSES })
  @IsIn(VULN_FINDING_STATUSES)
  status!: VulnFindingStatus;
}
