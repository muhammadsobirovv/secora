import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { UpdateNoteRequestDto as UpdateNoteShape } from '@pentesthub/shared';

export class UpdateNoteDto implements UpdateNoteShape {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100_000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  content?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  targetId?: string | null;
}
