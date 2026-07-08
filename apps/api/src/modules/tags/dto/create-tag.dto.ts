import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { CreateTagRequestDto as CreateTagShape } from '@pentesthub/shared';

export class CreateTagDto implements CreateTagShape {
  @ApiProperty({ minLength: 1, maxLength: 50 })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({ description: 'Hex color, e.g. #FF5733' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
