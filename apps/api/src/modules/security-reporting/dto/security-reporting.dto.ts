import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { SecurityReportType } from '@pentesthub/shared';

const SECURITY_REPORT_TYPES = ['INCIDENT_SUMMARY', 'THREAT_INTEL_SUMMARY', 'POSTURE_SUMMARY'] as const;

/// Module 17 — task #481 (Security Reporting extensions / Report
/// Builder). `windowDays` scopes the report's own `periodStart`/
/// `periodEnd` metadata — see `SecurityReportingService.generate`'s doc
/// comment for why the underlying content is still a point-in-time
/// snapshot rather than a literally-windowed query on every sub-source.
export class GenerateSecurityReportDto {
  @ApiProperty({ enum: SECURITY_REPORT_TYPES }) @IsIn(SECURITY_REPORT_TYPES) type!: SecurityReportType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) windowDays?: number;
}
