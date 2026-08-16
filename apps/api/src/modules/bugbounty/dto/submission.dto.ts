import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  CreateSubmissionRequestDto as CreateShape,
  SubmissionStatus,
  UpdateSubmissionStatusRequestDto as UpdateShape,
} from '@pentesthub/shared';

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'TRIAGED',
  'INFORMATIVE',
  'DUPLICATE',
  'NOT_APPLICABLE',
  'ACCEPTED',
  'RESOLVED',
  'BOUNTY_PAID',
  'CLOSED',
  'REOPENED',
];

const BUG_BOUNTY_PLATFORMS = [
  'HACKERONE',
  'BUGCROWD',
  'INTIGRITI',
  'YESWEHACK',
  'SYNACK',
  'INTERNAL',
  'PRIVATE',
  'CUSTOM',
];

const VULN_FINDING_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/// `findingId` is the only reference field — no `programId`/`workspaceId`.
/// See CreateSubmissionCommand's doc comment: program/project/workspace
/// are always derived server-side from the finding the caller is
/// authorized to see, never taken from the request body.
export class CreateSubmissionDto implements CreateShape {
  @ApiProperty() @IsUUID() findingId!: string;

  @ApiProperty({ maxLength: 300 }) @IsString() @MaxLength(300) title!: string;

  @ApiProperty({ enum: VULN_FINDING_SEVERITIES })
  @IsIn(VULN_FINDING_SEVERITIES)
  severity!: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() bugReportId?: string;

  @ApiProperty({ enum: BUG_BOUNTY_PLATFORMS })
  @IsIn(BUG_BOUNTY_PLATFORMS)
  platform!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) externalId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) externalUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class UpdateSubmissionStatusDto implements UpdateShape {
  @ApiProperty({ enum: SUBMISSION_STATUSES })
  @IsIn(SUBMISSION_STATUSES)
  status!: SubmissionStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() responseAt?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) reward?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) currency?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class ListSubmissionsQueryParamsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() findingId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(SUBMISSION_STATUSES) status?: string;
}
