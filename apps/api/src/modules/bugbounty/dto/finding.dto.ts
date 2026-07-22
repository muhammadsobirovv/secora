import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  BugBountyFindingStage,
  CheckDuplicateFindingRequestDto as CheckDuplicateShape,
  CreateBugBountyFindingRequestDto as CreateShape,
  CvssVectorComponents,
  ListBugBountyFindingsQueryDto as ListShape,
  OwaspCategory,
  TransitionBugBountyFindingStageRequestDto as TransitionShape,
  UpdateBugBountyFindingRequestDto as UpdateShape,
  VulnFindingSeverity,
} from '@pentesthub/shared';
import { OWASP_CATEGORIES } from './owasp-categories.js';
import { CvssVectorComponentsDto } from './cvss.dto.js';

export const BUGBOUNTY_FINDING_STAGES: BugBountyFindingStage[] = [
  'DRAFT',
  'NEW',
  'TRIAGED',
  'VERIFIED',
  'REPORTED',
  'DUPLICATE',
  'INFORMATIVE',
  'ACCEPTED',
  'NEED_MORE_INFO',
  'REJECTED',
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

/// One entry in `BugBountyFinding.mitreAttack` — a lightweight
/// (id, name) pair (e.g. `{ id: "T1190", name: "Exploit Public-Facing
/// Application" }`), not a full ATT&CK technique object; the finding
/// only needs to reference which techniques apply, not duplicate
/// MITRE's own technique catalog.
export class MitreAttackTechniqueDto {
  @ApiProperty() @IsString() @MaxLength(20) id!: string;
  @ApiProperty() @IsString() @MaxLength(300) name!: string;
}

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

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) capec?: string;

  @ApiPropertyOptional({ enum: OWASP_CATEGORIES })
  @IsOptional()
  @IsIn(OWASP_CATEGORIES)
  owaspCategory?: OwaspCategory;

  @ApiPropertyOptional({ type: [MitreAttackTechniqueDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MitreAttackTechniqueDto)
  mitreAttack?: MitreAttackTechniqueDto[];

  @ApiPropertyOptional({ type: CvssVectorComponentsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CvssVectorComponentsDto)
  cvssBreakdown?: CvssVectorComponents;
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

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) capec?: string;

  @ApiPropertyOptional({ enum: OWASP_CATEGORIES })
  @IsOptional()
  @IsIn(OWASP_CATEGORIES)
  owaspCategory?: OwaspCategory;

  @ApiPropertyOptional({ type: [MitreAttackTechniqueDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MitreAttackTechniqueDto)
  mitreAttack?: MitreAttackTechniqueDto[];

  @ApiPropertyOptional({ type: CvssVectorComponentsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CvssVectorComponentsDto)
  cvssBreakdown?: CvssVectorComponents;
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

  @ApiPropertyOptional() @IsOptional() @IsUUID() excludeFindingId?: string;
}
