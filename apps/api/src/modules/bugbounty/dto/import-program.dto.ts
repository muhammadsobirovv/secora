import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type {
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

  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: 