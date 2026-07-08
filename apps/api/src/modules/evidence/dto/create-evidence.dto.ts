import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { CreateEvidenceRequestDto as CreateEvidenceShape } from '@pentesthub/shared';
import type { EvidenceType } from '../../../prisma-types.js';

const EVIDENCE_TYPES: EvidenceType[] = [
  'SCREENSHOT',
  'HTTP_REQUEST',
  'HTTP_RESPONSE',
  'FILE',
  'LOG',
  'VIDEO',
];

export class CreateEvidenceDto implements CreateEvidenceShape {
  @ApiProperty({ enum: EVIDENCE_TYPES })
  @IsIn(EVIDENCE_TYPES)
  type!: EvidenceType;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetId?: string;
}
