import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  TARGET_AUTHORIZATION_BASES,
  type AttestTargetAuthorizationRequestDto,
  type TargetAuthorizationBasis,
} from '@pentesthub/shared';

export class AttestTargetAuthorizationDto implements AttestTargetAuthorizationRequestDto {
  @ApiProperty({ enum: TARGET_AUTHORIZATION_BASES })
  @IsIn(TARGET_AUTHORIZATION_BASES)
  basis!: TargetAuthorizationBasis;

  @ApiProperty({
    description:
      'Must be true: "I own this asset or have current written authorization; I will stay inside the authorized scope."',
  })
  @IsBoolean()
  @Equals(true)
  attested!: boolean;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  documentReference?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'ISO date; default now + 12 months.' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
