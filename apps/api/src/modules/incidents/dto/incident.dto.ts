import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type {
  CreateIncidentRequestDto,
  IncidentSeverity,
  IncidentSeverityFactorsDto,
  IncidentStatus,
} from '@pentesthub/shared';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const STATUSES = [
  'OPEN',
  'INVESTIGATING',
  'CONTAINMENT',
  'ERADICATION',
  'RECOVERY',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
] as const;
const CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/// Module 17 — task #470. Mirrors `IncidentSeverityFactorsDto`
/// (packages/shared/src/soc-threat-intel.ts) — every field is an
/// explainability breakdown, never an opaque score (spec section 12:
/// severity must be explainable).
export class IncidentSeverityFactorsInputDto implements IncidentSeverityFactorsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() impact?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) confidence?: number;
  @ApiPropertyOptional({ enum: CRITICALITIES }) @IsOptional() @IsIn(CRITICALITIES) assetCriticality?: IncidentSeverityFactorsDto['assetCriticality'];
  @ApiPropertyOptional() @IsOptional() @IsString() exploitability?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() exposure?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() threatIntelRelevance?: string;
}

export class CreateIncidentDto implements CreateIncidentRequestDto {
  @ApiProperty() @IsString() projectId!: string;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() description!: string;
  @ApiProperty({ enum: SEVERITIES }) @IsIn(SEVERITIES) severity!: IncidentSeverity;
  @ApiPropertyOptional({ type: IncidentSeverityFactorsInputDto })
  @IsOptional()
  @IsObject()
  severityFactors?: IncidentSeverityFactorsDto;
}

export class UpdateIncidentStatusDto {
  @ApiProperty({ enum: STATUSES }) @IsIn(STATUSES) status!: IncidentStatus;
  @ApiPropertyOptional({ description: 'Why the status changed — recorded on the immutable timeline.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignIncidentDto {
  @ApiPropertyOptional({ description: 'User id to assign; omit/null to unassign.' })
  @IsOptional()
  @IsString()
  assigneeId?: string | null;
}

export class AddIncidentTimelineNoteDto {
  @ApiProperty() @IsString() description!: string;
}

const ASSET_NODE_TYPES = [
  'DOMAIN', 'SUBDOMAIN', 'IP', 'PORT', 'URL', 'ENDPOINT', 'TECHNOLOGY',
  'CERTIFICATE', 'ASN', 'CLOUD_ASSET', 'REPOSITORY', 'FINDING',
  'CIDR', 'API', 'SERVICE', 'MOBILE_APP', 'HOST', 'CONTAINER', 'KUBERNETES_RESOURCE',
] as const;

export class LinkIncidentAssetDto {
  @ApiProperty() @IsString() targetId!: string;
  @ApiProperty({ enum: ASSET_NODE_TYPES }) @IsIn(ASSET_NODE_TYPES) nodeType!: (typeof ASSET_NODE_TYPES)[number];
  @ApiProperty() @IsString() refId!: string;
}

export class LinkIncidentFindingDto {
  @ApiProperty() @IsString() findingId!: string;
}

export class LinkIncidentIndicatorDto {
  @ApiProperty() @IsString() indicatorId!: string;
}

export class LinkIncidentEvidenceDto {
  @ApiProperty() @IsString() evidenceId!: string;
}

export class LinkIncidentResearchSessionDto {
  @ApiProperty() @IsString() sessionId!: string;
}

export class ListIncidentsQueryDto {
  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsIn(STATUSES) status?: IncidentStatus;
  @ApiPropertyOptional({ enum: SEVERITIES }) @IsOptional() @IsIn(SEVERITIES) severity?: IncidentSeverity;
  @ApiPropertyOptional() @IsOptional() @IsString() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
