import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { AcceptLegalRequestDto } from '@pentesthub/shared';

export class AcceptLegalDto implements AcceptLegalRequestDto {
  @ApiProperty({
    example: '2026-10-06',
    description: 'Must equal the current LEGAL_VERSION.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  version!: string;
}
