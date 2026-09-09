import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { CreateFeatureFlagRequestDto, FeatureFlagEditionRules } from '@pentesthub/shared';

export class CreateFeatureFlagDto implements CreateFeatureFlagRequestDto {
  @ApiProperty({ description: 'Stable machine key, e.g. "new-report-builder"' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9][a-z0-9-_.]*$/, { message: 'key must be lowercase, alphanumeric, and may contain -, _, .' })
  key!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  defaultEnabled?: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  editionRules?: FeatureFlagEditionRules;
}
