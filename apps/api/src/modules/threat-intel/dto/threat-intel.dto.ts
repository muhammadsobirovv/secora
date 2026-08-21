import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  IndicatorStatus,
  IndicatorType,
  ThreatIntelSourceType,
  ThreatMatchAnalystStatus,
} from '@pentesthub/shared';

const INDICATOR_TYPES = [
  'IP', 'DOMAIN', 'URL', 'HASH', 'EMAIL', 'CVE', 'CPE', 'ASN', 'CERTIFICATE', 'FILE', 'MALWARE_FAMILY',
] as const;
const INDICATOR_STATUSES = ['ACTIVE', 'EXPIRED', 'DISABLED'] as const;
const THREAT_INTEL_SOURCE_TYPES = [
  'CISA_KEV', 'NVD', 'OSV', 'GITHUB_ADVISORIES', 'VENDOR_ADVISORY', 'STIX_TAXII', 'OPERATOR_FEED', 'MANUAL_IMPORT',
] as const;
const THREAT_MATCH_ANALYST_STATUSES = ['NEW', 'UNDER_REVIEW', 'CONFIRMED', 'FALSE_POSITIVE', 'IGNORED'] as const;

/// Module 17 — task #467 (Indicator management). A manually-added
/// indicator is always created private to the caller's workspace
/// (`workspaceId` set server-side, never client-supplied — see
/// `IndicatorsService.createManual`) — only provider/STIX-TAXII ingestion
/// ever writes a public (`workspaceId: null`) indicator.
export class CreateIndicatorDto {
  @ApiProperty({ enum: INDICATOR_TYPES }) @IsIn(INDICATOR_TYPES) type!: IndicatorType;
  @ApiProperty() @IsString() @MaxLength(2048) value!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) confidence?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() expiresAt?: string;
}

export class UpdateIndicatorStatusDto {
  @ApiProperty({ enum: INDICATOR_STATUSES }) @IsIn(INDICATOR_STATUSES) status!: IndicatorStatus;
}

export class ListIndicatorsQueryDto {
  @ApiPropertyOptional({ enum: INDICATOR_TYPES }) @IsOptional() @IsIn(INDICATOR_TYPES) type?: IndicatorType;
  @ApiPropertyOptional({ enum: INDICATOR_STATUSES }) @IsOptional() @IsIn(INDICATOR_STATUSES) status?: IndicatorStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2048) search?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

/// Module 17 — task #465 (Threat Intelligence Engine). Mirrors
/// `RefreshCveRequestDto`'s shape — `sourceType` is optional and defaults
/// to whatever `THREAT_INTEL_PROVIDER` is configured to, so an operator
/// can trigger the configured provider without knowing its name, but can
/// also explicitly pick a different *already-configured-compatible*
/// public feed (cisa_kev/nvd/osv/github_advisories don't need extra
/// config beyond being reachable).
export class RefreshThreatIntelDto {
  @ApiPropertyOptional({ enum: THREAT_INTEL_SOURCE_TYPES })
  @IsOptional()
  @IsIn(THREAT_INTEL_SOURCE_TYPES)
  sourceType?: ThreatIntelSourceType;
}

/// Module 17 — task #468 (STIX/TAXII foundation). `bundle` is untrusted
/// external data (spec section 38) — validated structurally by
/// `StixTaxiiService`, never executed/evaluated. `StixTaxiiService` caps
/// the object count it will process per bundle (`MAX_OBJECTS_PER_BUNDLE`)
/// and the length of every string field it reads — but note there is
/// currently no *global* request body-size limit configured in
/// `bootstrap.ts`, so an operator fronting this API directly (rather than
/// through a reverse proxy with its own limit) should configure one;
/// tracked as a disclosed gap, not silently assumed to be covered
/// elsewhere.
export class ImportStixBundleDto {
  @ApiProperty({ description: 'A STIX 2.1 Bundle object: { type: "bundle", objects: [...] }' })
  @IsObject()
  bundle!: Record<string, unknown>;
}

export class UpdateThreatMatchStatusDto {
  @ApiProperty({ enum: THREAT_MATCH_ANALYST_STATUSES }) @IsIn(THREAT_MATCH_ANALYST_STATUSES) analystStatus!: ThreatMatchAnalystStatus;
}
