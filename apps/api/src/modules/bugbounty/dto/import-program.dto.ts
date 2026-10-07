import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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

  @ApiPropertyOptional({
    type: () => ProgramScopeAttestationDto,
    description:
      'Confirm you take part in this program and will test only its in-scope assets. Linked targets the program classifies IN_SCOPE then count as authorized for active scans.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProgramScopeAttestationDto)
  scopeAttestation?: ProgramScopeAttestationDto;
}

export class ProgramScopeAttestationDto {
  @ApiProperty() @IsBoolean() @Equals(true) attested!: boolean;

  @ApiPropertyOptional({ description: 'ISO date; default now + 12 months.' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
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
