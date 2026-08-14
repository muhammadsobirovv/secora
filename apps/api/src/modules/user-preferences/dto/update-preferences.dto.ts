import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SUPPORTED_LOCALES, type UpdateUserPreferencesRequestDto as UpdatePreferencesShape } from '@pentesthub/shared';
import type { Theme } from '../../../prisma-types.js';

const THEMES: Theme[] = ['LIGHT', 'DARK', 'SYSTEM'];

export class UpdatePreferencesDto implements UpdatePreferencesShape {
  @ApiPropertyOptional({ enum: THEMES })
  @IsOptional()
  @IsIn(THEMES)
  theme?: Theme;

  // Module 15 — task #348. `language` stays a plain `String` column (see
  // schema.prisma) rather than a Prisma enum — tightening it to
  // SUPPORTED_LOCALES here, at the DTO boundary, gets the same guarantee
  // without a schema migration (this pass deliberately avoids adding to
  // the already-disclosed stale-generated-Prisma-client gap — task #365).
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  telemetryOptOut?: boolean;

  // Module 15 — task #351 (first-run onboarding). Write-only, one-directional:
  // `true` stamps `onboardingCompletedAt`; anything else is a no-op. See the
  // shared-package doc comment on `UpdateUserPreferencesRequestDto` for why.
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;
}
