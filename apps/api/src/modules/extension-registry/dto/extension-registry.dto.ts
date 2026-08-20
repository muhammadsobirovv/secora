import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  ExtensionPermission,
  ExtensionType,
  InvokeExtensionRequestDto as InvokeExtensionShape,
  ListExtensionsQueryDto as ListExtensionsShape,
  RegisterExtensionRequestDto as RegisterExtensionShape,
} from '@pentesthub/shared';

export const EXTENSION_TYPES: ExtensionType[] = [
  'RECON_PROVIDER',
  'SCANNER_PROVIDER',
  'INTELLIGENCE_PROVIDER',
  'AI_AGENT',
  'REPORT_TEMPLATE',
  'WORKFLOW_NODE',
  'MARKETPLACE_PLUGIN',
];

export const EXTENSION_PERMISSIONS: ExtensionPermission[] = [
  'NETWORK_OUTBOUND',
  'READ_TARGETS',
  'READ_FINDINGS',
  'WRITE_FINDINGS',
  'READ_EVIDENCE',
  'WRITE_EVIDENCE',
  'EXECUTE_TOOL',
  'READ_AI_MEMORY',
  'WRITE_AI_MEMORY',
  'READ_REPORTS',
  'WRITE_REPORTS',
];

export class RegisterExtensionDto implements RegisterExtensionShape {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiProperty() @IsString() @MaxLength(50) version!: string;
  @ApiProperty({ enum: EXTENSION_TYPES }) @IsIn(EXTENSION_TYPES) type!: ExtensionType;
  @ApiProperty({ enum: EXTENSION_PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayMaxSize(50)
  @IsIn(EXTENSION_PERMISSIONS, { each: true })
  permissions!: ExtensionPermission[];
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) capabilities!: string[];
  @ApiProperty() @IsString() @MaxLength(500) entrypoint!: string;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ListExtensionsQueryParamsDto implements ListExtensionsShape {
  @ApiPropertyOptional({ enum: EXTENSION_TYPES }) @IsOptional() @IsIn(EXTENSION_TYPES) type?: ExtensionType;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  enabled?: boolean;
}

/// Hardening pass: the real invocation path. `permission` must be one of
/// the closed EXTENSION_PERMISSIONS vocabulary (same `@IsIn` check as
/// RegisterExtensionDto.permissions) — the enforcer then checks it was
/// actually declared by *this* extension at registration time.
/// `input` is capped in size (JSON-stringified length, checked in the
/// handler, not here) to bound what gets relayed to an entrypoint.
export class InvokeExtensionDto implements InvokeExtensionShape {
  @ApiProperty({ enum: EXTENSION_PERMISSIONS }) @IsIn(EXTENSION_PERMISSIONS) permission!: ExtensionPermission;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() input?: Record<string, unknown>;
}
