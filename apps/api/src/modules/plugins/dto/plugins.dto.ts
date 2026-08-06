import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  ExecutePluginHookRequestDto as ExecuteHookShape,
  InstallPluginRequestDto as InstallShape,
  ListMarketplacePacksQueryDto as ListMarketplacePacksShape,
  ListPluginsQueryDto as ListPluginsShape,
  PluginCategory,
  PluginDependencyDto,
  PluginManifest,
  PluginStatus,
  PublishPluginRequestDto as PublishShape,
  PublishPluginVersionRequestDto as PublishVersionShape,
  RatePluginRequestDto as RateShape,
  UpdatePluginInstallationRequestDto as UpdateInstallShape,
  UpdatePluginRequestDto as UpdatePluginShape,
} from '@pentesthub/shared';
import { PACK_CATEGORIES } from '@pentesthub/shared';

const PLUGIN_CATEGORIES: PluginCategory[] = [
  'RECON',
  'SCANNERS',
  'AI_TOOLS',
  'REPORTING',
  'INTEGRATIONS',
  'DASHBOARDS',
  'UTILITIES',
  // Module 13 — Automation Marketplace (task #287) pack types. The
  // `PluginCategory` union (`@pentesthub/shared`) already includes these;
  // this validator array was the one other place a Module 10 file needed
  // to change for Module 13 integration to actually work end-to-end
  // (publishing a pack with one of these categories would otherwise be
  // rejected by `@IsIn(PLUGIN_CATEGORIES)`).
  'PROMPT_PACK',
  'WORKFLOW_PACK',
  'RECON_PACK',
  'SCANNER_PACK',
  'REPORT_TEMPLATE',
  'PLAYBOOK',
  'AGENT_PACK',
  'THEME_PACK',
  'LANGUAGE_PACK',
];
const PLUGIN_STATUSES: PluginStatus[] = ['DRAFT', 'PUBLISHED', 'DEPRECATED', 'SUSPENDED'];

export class PluginDependencyInputDto implements PluginDependencyDto {
  @ApiProperty() @IsString() slug!: string;
  @ApiProperty() @IsString() versionRange!: string;
}

export class PublishPluginVersionDto implements PublishVersionShape {
  @ApiProperty() @IsString() @MaxLength(40) version!: string;
  @ApiProperty({ type: Object }) @IsObject() manifest!: PluginManifest;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) permissions!: string[];
  @ApiPropertyOptional({ type: [PluginDependencyInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PluginDependencyInputDto)
  dependencies?: PluginDependencyDto[];
  @ApiProperty() @IsString() sourceBundleBase64!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signature?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) changelog?: string;
}

export class PublishPluginDto implements PublishShape {
  @ApiProperty() @IsString() @MaxLength(60) slug!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ enum: PLUGIN_CATEGORIES }) @IsIn(PLUGIN_CATEGORIES) category!: PluginCategory;
  @ApiProperty() @IsString() @MaxLength(1000) description!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() iconUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() homepageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() repoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentationMarkdown?: string;
  @ApiProperty({ type: PublishPluginVersionDto })
  @ValidateNested()
  @Type(() => PublishPluginVersionDto)
  version!: PublishPluginVersionDto;
}

export class UpdatePluginDto implements UpdatePluginShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() iconUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() homepageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() repoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentationMarkdown?: string;
  @ApiPropertyOptional({ enum: PLUGIN_STATUSES }) @IsOptional() @IsIn(PLUGIN_STATUSES) status?: PluginStatus;
}

export class ListPluginsQueryParamsDto implements ListPluginsShape {
  @ApiPropertyOptional({ enum: PLUGIN_CATEGORIES }) @IsOptional() @IsIn(PLUGIN_CATEGORIES) category?: PluginCategory;
  @ApiPropertyOptional({ enum: PLUGIN_STATUSES }) @IsOptional() @IsIn(PLUGIN_STATUSES) status?: PluginStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

/// Module 13 — Automation Marketplace (task #287).
export class ListMarketplacePacksQueryParamsDto implements ListMarketplacePacksShape {
  @ApiPropertyOptional({ enum: PACK_CATEGORIES })
  @IsOptional()
  @IsIn([...PACK_CATEGORIES])
  category?: PluginCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class InstallPluginDto implements InstallShape {
  @ApiProperty() @IsUUID() pluginId!: string;
  @ApiProperty() @IsUUID() versionId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() config?: Record<string, unknown>;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) acceptedPermissions!: string[];
}

export class UpdatePluginInstallationDto implements UpdateInstallShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() versionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() config?: Record<string, unknown>;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) acceptedPermissions?: string[];
}

export class RatePluginDto implements RateShape {
  @ApiProperty() @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) review?: string;
}

export class ExecutePluginHookDto implements ExecuteHookShape {
  @ApiProperty() @IsString() hook!: string;
  @ApiProperty({ type: Object }) @IsObject() input!: Record<string, unknown>;
}
