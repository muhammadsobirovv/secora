import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type {
  DetectProgramUpdateRequestDto as DetectUpdateShape,
  ImportProgramRequestDto as ImportShape,
  ProgramImportSource,
} from '@pentesthub/shared';

export const PROGRAM_IMPORT_SOURCES: ProgramImportSource[] = [
  'HACKERONE',
  'BUGCROWD',
  'INTIGRITI',
  'MARKDOWN',
  'JSON',
];

export class ImportProgramDto implements ImportShape {
  @ApiProperty({ enum: PROGRAM_IMPORT_SOURCES })
  @IsIn(PROGRAM_IMPORT_SOURCES)
  source!: ProgramImportSource;

  @ApiProperty({ maxLength: 200_000 })
  @IsString()
  @MaxLength(200_000)
  raw!: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

/// Shared by both the `detect-update` (read-only preview) and `reimport`
/// (apply) endpoints on an existing program — same shape as
/// ImportProgramDto minus `projectId` (a reimport can't move the
/// program to a different project; use the normal update endpoint).
export class DetectProgramUpdateDto implements DetectUpdateShape {
  @ApiProperty({ enum: PROGRAM_IMPORT_SOURCES })
  @IsIn(PROGRAM_IMPORT_SOURCES)
  source!: ProgramImportSource;

  @ApiProperty({ maxLength: 200_000 })
  @IsString()
  @MaxLength(200_000)
  raw!: string;
}
