import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { RunAdHocCommandRequestDto as RunShape } from '@pentesthub/shared';

/// `args` is a display/metadata field only — logged into `argsSummary`,
/// never interpolated into a shell command or passed to a runner as raw
/// CLI flags (AdHocCommandService's ToolRunner/ScannerRunner calls pass
/// only `target`/`job`/`signal`/`onLog`, exactly like Recon/Vuln job
/// execution — the same runner implementations, unaware `args` even
/// exists). This keeps the field useful for the UI/audit trail ("what did
/// the user ask for") without it ever becoming an injection surface.
export class RunAdHocCommandDto implements RunShape {
  @ApiProperty() @IsUUID() targetId!: string;

  @ApiProperty({ maxLength: 64 }) @IsString() @MaxLength(64) tool!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  args: string[] = [];

  @ApiPropertyOptional() @IsOptional() @IsUUID() researchSessionId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() approvalRequestId?: string;
}

export class ListAdHocCommandsQueryParamsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
