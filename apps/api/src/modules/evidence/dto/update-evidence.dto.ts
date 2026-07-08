import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateEvidenceRequestDto as UpdateEvidenceShape } from '@pentesthub/shared';

export class UpdateEvidenceDto implements UpdateEvidenceShape {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 100_000 })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  textContent?: string;
}
