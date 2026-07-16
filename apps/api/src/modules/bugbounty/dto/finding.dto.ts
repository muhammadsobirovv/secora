import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type {
  BugBountyFindingStage,
  CheckDuplicateFindingRequestDto as CheckDuplicateShape,
  CreateBugBountyFindingRequestDto as CreateShape,
  ListBugBountyFindingsQueryDto as ListShape,
  TransitionBugBountyFindingStageRequestDto as TransitionShape,
  UpdateBugBountyFindingRequestDto as UpdateShape,
  VulnFindingSeverity,
} from '@pentesthub/shared';

export const BUGBOUNTY_FINDING_STAGES: BugBountyFindingStage[] = [
  'NEW',
  'TRIAGED',
  'VERIFIED',
  'REPORTED',
  'DUPLICATE',
  'NEED_MORE_INFO',
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
];

export const VULN_FINDING_SEVERITIES: VulnFindingSeverity[] = [
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

export class CreateBugBountyFindingDto implements CreateShape {
  @ApiProperty() @IsUUID() programId!: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() vulnFindingId?: string;

  @ApiProperty({ maxLength: 300 }) @IsString() @MaxLength(300) title!: string;

  @ApiProperty() @IsString() description!: string;

  @ApiProperty({ enum: VULN_FINDING_SEVERITIES })
  @IsIn(VULN_FINDING_SEVERITIES)
  severity!: VulnFindingSeverity;

  @ApiPropertyOptional() @IsOptional() @IsNumber() cvssScore?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() cvssVector?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() cwe?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() vulnType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  endpoint?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() payload?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  evidenceIds?: string[];
}

export class UpdateBugBountyFindingDto implements UpdateShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() vulnFindingId?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ enum: VULN_FINDING_SEVERITIES })
  @IsOptional()
  @IsIn(VULN_FINDING_SEVERITIES)
  severity?: VulnFindingSeverity;

  @ApiPropertyOptional() @IsOptional() @IsNumber() cvssScore?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() cvssVector?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() cwe?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() vulnType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  endpoint?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() payload?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  evidenceIds?: string[];
}

export class TransitionBugBountyFindingStageDto implements TransitionShape {
  @ApiProperty({ enum: BUGBOUNTY_FINDING_STAGES })
  @IsIn(BUGBOUNTY_FINDING_STAGES)
  stage!: BugBountyFindingStage;

  @ApiPropertyOptional() @IsOptional() @IsUUID() duplicateOfId?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() bountyAmount?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
}

export class ListBugBountyFindingsQueryParamsDto implements ListShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;

  @ApiPropertyOptional({ enum: BUGBOUNTY_FINDING_STAGES })
  @IsOptional()
  @IsIn(BUGBOUNTY_FINDING_STAGES)
  stage?: BugBountyFindingStage;

  @ApiPropertyOptional({ enum: VULN_FINDING_SEVERITIES })
  @IsOptional()
  @IsIn(VULN_FINDING_SEVERITIES)
  severity?: VulnFindingSeverity;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CheckDuplicateFindingDto implements CheckDuplicateShape {
  @ApiProperty({ maxLength: 300 }) @IsString() @MaxLength(300) title!: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  endpoint?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() payload?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() vulnType?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;

  @ApiPropertyOpti