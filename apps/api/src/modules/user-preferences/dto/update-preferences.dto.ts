import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { UpdateUserPreferencesRequestDto as UpdatePreferencesShape } from '@pentesthub/shared';
import type { Theme } from '../../../prisma-types.js';

const THEMES: Theme[] = ['LIGHT', 'DARK', 'SYSTEM'];

export class UpdatePreferencesDto implements UpdatePreferencesShape {
  @ApiPropertyOptional({ enum: THEMES })
  @IsOptional()
  @IsIn(THEMES)
  theme?: Theme;

  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}
