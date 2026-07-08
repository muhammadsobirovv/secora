import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { CreateNoteRequestDto as CreateNoteShape } from '@pentesthub/shared';

export class CreateNoteDto implements CreateNoteShape {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ minLength: 1, maxLength: 100_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetId?: string;
}
