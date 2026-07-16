import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type {
  BugBountyPlatform,
  BugBountyProgramStatus,
  CreateBugBountyProgramRequestDto as CreateShape,
  ListBugBountyProgramsQueryDto as ListShape,
  UpdateBugBountyProgramRequestDto as UpdateShape,
} from '@pentesthub/shared';

export const BUGBOUNTY_PLATFORMS: BugBountyPlatform[] = [
  'HACKERONE',
  'BUGCROWD',
  'INTIGRITI',
  'YESWEHACK',
  'SYNACK',
  'INTERNAL',
  'PRIVATE',
  'CUSTOM',
];

export const BUGBOUNTY_PROGRAM_STATUSES: BugBountyProgramStatus[] = [
  'ACTIVE',
  'PAUSED',
  'CLOSED',
  'ARCHIVED',
];

export class CreateBugBountyProgramDto implements CreateShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;

  @ApiProperty({ maxLength: 200 }) @IsString() @MaxLength(200) name!: string;

  @ApiProperty({ enum: BUGBOUNTY_PLATFORMS })
  @IsIn(BUGBOUNTY_PLATFORMS)
  platform!: BugBountyPlatform;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional({ enum: BUGBOUNTY_PROGRAM_STATUSES })
  @IsOptional()
  @IsIn(BUGBOUNTY_PROGRAM_STATUSES)
  status?: BugBountyProgramStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() rulesMarkdown?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  bountyTable?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  severityMatrix?: Record<string, unknown>;

  @ApiPropertyOptional() @IsOptional() @IsString() disclosurePolicy?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notesMarkdown?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateBugBountyProgramDto implements UpdateShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: BUGBOUNTY_PLATFORMS })
  @IsOptional()
  @IsIn(BUGBOUNTY_PLATFORMS)
  platform?: BugBountyPlatform;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional({ enum: BUGBOUNTY_PROGRAM_STATUSES })
  @IsOptional()
  @IsIn(BUGBOUNTY_PROGRAM_STATUSES)
  status?: BugBountyProgramStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() rulesMarkdown?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  bountyTable?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  severityMatrix?: Record<string, unknown>;

  @ApiPropertyOptional() @IsOptional() @IsString() disclosurePolicy?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notesMarkdown?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ListBugBountyProgramsQueryParamsDto implements ListShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;

  @ApiPropertyOptional({ enum: BUGBOUNTY_PLATFORMS })
  @IsOptional()
  @IsIn(BUGBOUNTY_PLATFORMS)
  platform?: BugBountyPlatform;

  @ApiPropertyOptional({ enum: BUGBOUNTY_PROGRAM_STATUSES })
  @IsOptional()
  @IsIn(BUGBOUNTY_PROGRAM_STATUSES)
  status?: BugBountyProgramStatus;

  @ApiPropertyOption