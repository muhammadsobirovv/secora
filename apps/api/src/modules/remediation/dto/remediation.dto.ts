import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type {
  AssetGraphNodeType,
  CreateRemediationTaskRequestDto,
  FindingVerificationStatus,
  RemediationPriority,
  RemediationStatus,
  UpdateFindingVerificationRequestDto,
  UpdateRemediationTaskRequestDto,
  UpdateRemediationTaskStatusRequestDto,
} from '@pentesthub/shared';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'READY_FOR_VERIFICATION', 'VERIFIED', 'CLOSED'] as const;
const VERIFICATION_STATUSES = ['OPEN', 'FIXED_CLAIMED', 'VERIFICATION', 'VERIFIED', 'CLOSED'] as const;
const ASSET_NODE_TYPES = [
  'DOMAIN', 'SUBDOMAIN', 'IP', 'PORT', 'URL', 'ENDPOINT', 'TECHNOLOGY',
  'CERTIFICATE', 'ASN', 'CLOUD_ASSET', 'REPOSITORY', 'FINDING',
  'CIDR', 'API', 'SERVICE', 'MOBILE_APP', 'HOST', 'CONTAINER', 'KUBERNETES_RESOURCE',
] as const;

/// Module 17 — task #477 (Remediation tracking & verification, spec
/// sections 21-22). Mirrors `incident.dto.ts`'s conventions.
export class CreateRemediationTaskDto implements CreateRemediationTaskRequestDto {
  @ApiProperty() @IsString() projectId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() findingId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() incidentId?: string;
  @ApiPropertyOptional({ enum: ASSET_NODE_TYPES }) @IsOptional() @IsIn(ASSET_NODE_TYPES) assetNodeType?: AssetGraphNodeType;
  @ApiPropertyOptional() @IsOptional() @IsString() assetRefId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() team?: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: RemediationPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateRemediationTaskDto implements UpdateRemediationTaskRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() team?: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: RemediationPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateRemediationTaskStatusDto implements UpdateRemediationTaskStatusRequestDto {
  @ApiProperty({ enum: STATUSES }) @IsIn(STATUSES) status!: RemediationStatus;
}

export class LinkRemediationEvidenceDto {
  @ApiProperty() @IsString() evidenceId!: string;
}

export class ListRemediationTasksQueryDto {
  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsIn(STATUSES) status?: RemediationStatus;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: RemediationPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() incidentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() findingId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

/// The finding-verification lifecycle is intentionally reachable from a
/// dedicated `/findings/:id/verification` route (see
/// `RemediationController`) rather than folded into the bug-bounty
/// findings controller — this keeps the "verification requires evidence"
/// enforcement (`FindingVerificationService`) colocated with the rest of
/// the Remediation tracking surface it was built for (spec section 22).
export class UpdateFindingVerificationDto implements UpdateFindingVerificationRequestDto {
  @ApiProperty({ enum: VERIFICATION_STATUSES }) @IsIn(VERIFICATION_STATUSES) status!: FindingVerificationStatus;
  @ApiPropertyOptional({ description: 'Required when status is VERIFIED unless already set on the finding.' })
  @IsOptional()
  @IsString()
  verificationEvidenceId?: string;
}
