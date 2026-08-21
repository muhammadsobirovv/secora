import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import type {
  AssetGraphNodeType,
  BusinessCriticality,
  ComputeRiskScoreRequestDto,
  RemediationStatus,
} from '@pentesthub/shared';

const ASSET_NODE_TYPES = [
  'DOMAIN', 'SUBDOMAIN', 'IP', 'PORT', 'URL', 'ENDPOINT', 'TECHNOLOGY',
  'CERTIFICATE', 'ASN', 'CLOUD_ASSET', 'REPOSITORY', 'FINDING',
  'CIDR', 'API', 'SERVICE', 'MOBILE_APP', 'HOST', 'CONTAINER', 'KUBERNETES_RESOURCE',
] as const;
const CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const REMEDIATION_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'READY_FOR_VERIFICATION', 'VERIFIED', 'CLOSED'] as const;

/// Module 17 — task #474/#475 (Risk Engine v2 + Risk prioritization,
/// spec sections 18-19).
export class ComputeRiskScoreDto implements ComputeRiskScoreRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() findingId?: string;
  @ApiPropertyOptional({ enum: ASSET_NODE_TYPES }) @IsOptional() @IsIn(ASSET_NODE_TYPES) assetNodeType?: AssetGraphNodeType;
  @ApiPropertyOptional() @IsOptional() @IsString() assetRefId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() persist?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() severity?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(10) cvssScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) epss?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isKnownExploited?: boolean;
  @ApiPropertyOptional({ enum: CRITICALITIES }) @IsOptional() @IsIn(CRITICALITIES) assetCriticality?: BusinessCriticality;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() internetExposure?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) technologyConfidence?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) findingConfidence?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) threatIntelSignal?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() exploitability?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() businessImpact?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) ageDays?: number;
  @ApiPropertyOptional({ enum: REMEDIATION_STATUSES }) @IsOptional() @IsIn(REMEDIATION_STATUSES) remediationStatus?: RemediationStatus;
}
