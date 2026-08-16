import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type {
  CreateResearchSessionRequestDto,
  LinkResearchSessionEntityRequestDto,
} from '@pentesthub/shared';

export class CreateResearchSessionDto implements CreateResearchSessionRequestDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() targetId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() programId?: string;
}

const ENTITY_TYPES = [
  'RECON_JOB',
  'VULN_SCAN_JOB',
  'BUGBOUNTY_FINDING',
  'VULN_FINDING',
  'NOTE',
  'EVIDENCE',
  'AD_HOC_COMMAND',
  'AI_CONVERSATION',
  'AI_INVESTIGATION_SESSION',
  'BUG_REPORT',
  'ACTIVITY_EVENT',
] as const;

export class LinkResearchSessionEntityDto implements LinkResearchSessionEntityRequestDto {
  @ApiProperty({ enum: ENTITY_TYPES })
  @IsIn(ENTITY_TYPES)
  entityType!: LinkResearchSessionEntityRequestDto['entityType'];
  @ApiProperty() @IsString() entityId!: string;
}
