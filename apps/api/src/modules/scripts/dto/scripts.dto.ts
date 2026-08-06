import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type {
  CreateScriptDefinitionRequestDto as CreateShape,
  ListScriptExecutionsQueryDto as ListExecutionsShape,
  RunScriptRequestDto as RunShape,
  ScriptExecutionStatus,
  ScriptLanguage,
  ScriptPermission,
  UpdateScriptDefinitionRequestDto as UpdateShape,
} from '@pentesthub/shared';
import { SCRIPT_PERMISSIONS } from '@pentesthub/shared';

const SCRIPT_LANGUAGES: ScriptLanguage[] = ['TYPESCRIPT', 'JAVASCRIPT', 'PYTHON'];
const SCRIPT_EXECUTION_STATUSES: ScriptExecutionStatus[] = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMEOUT'];

/// Module 13 — Security hardening (task #293). `sourceCode` previously
/// had no explicit length bound — an unbounded string field backing a
/// `TEXT` column that also gets `vm.Script`-compiled on every run is
/// both a storage-abuse and compile-cost DoS surface. In practice
/// Express's default `body-parser` JSON limit (100KB, unmodified
/// anywhere in `bootstrap.ts`) already rejects a request this large
/// before it reaches validation — but that's an accidental, easy-to-
/// regress protection (raising the global body limit for an unrelated
/// route, e.g. a future bulk-import endpoint, would silently remove it
/// here too). This is the explicit, script-specific ceiling: 80,000
/// characters (~80KB), comfortably inside the current global limit and
/// generous for a hand-written automation script.
const SCRIPT_SOURCE_CODE_MAX_LENGTH = 80_000;

export class CreateScriptDefinitionDto implements CreateShape {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiProperty({ enum: SCRIPT_LANGUAGES }) @IsIn(SCRIPT_LANGUAGES) language!: ScriptLanguage;
  @ApiProperty() @IsString() @MaxLength(SCRIPT_SOURCE_CODE_MAX_LENGTH) sourceCode!: string;
  @ApiProperty({ enum: SCRIPT_PERMISSIONS, isArray: true })
  @IsIn([...SCRIPT_PERMISSIONS], { each: true })
  permissions!: ScriptPermission[];
}

export class UpdateScriptDefinitionDto implements UpdateShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional({ enum: SCRIPT_LANGUAGES }) @IsOptional() @IsIn(SCRIPT_LANGUAGES) language?: ScriptLanguage;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SCRIPT_SOURCE_CODE_MAX_LENGTH) sourceCode?: string;
  @ApiPropertyOptional({ enum: SCRIPT_PERMISSIONS, isArray: true })
  @IsOptional()
  @IsIn([...SCRIPT_PERMISSIONS], { each: true })
  permissions?: ScriptPermission[];
}

export class RunScriptDto implements RunShape {
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() input?: Record<string, unknown>;
}

export class ListScriptExecutionsQueryParamsDto implements ListExecutionsShape {
  @ApiPropertyOptional({ enum: SCRIPT_EXECUTION_STATUSES }) @IsOptional() @IsIn(SCRIPT_EXECUTION_STATUSES) status?: ScriptExecutionStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
}
