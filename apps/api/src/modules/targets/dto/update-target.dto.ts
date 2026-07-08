import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { UpdateTargetRequestDto as UpdateTargetShape } from '@pentesthub/shared';
import type {
  TargetEnvironment,
  TargetScopeStatus,
} from '../../../prisma-types.js';

const TARGET_ENVIRONMENTS: TargetEnvironment[] = [
  'PRODUCTION',
  'STAGING',
  'DEVELOPMENT',
  'UNKNOWN',
];
const TARGET_SCOPE_STATUSES: TargetScopeStatus[] = [
  'IN_SCOPE',
  'OUT_OF_SCOPE',
  'PENDING_REVIEW',
];

export class UpdateTargetDto implements UpdateTargetShape {
  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  value?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: TARGET_ENVIRONMENTS })
  @IsOptional()
  @IsIn(TARGET_ENVIRONMENTS)
  environment?: TargetEnvironment;

  @ApiPropertyOptional({ enum: TARGET_SCOPE_STATUSES })
  @IsOptional()
  @IsIn(TARGET_SCOPE_STATUSES)
  scopeStatus?: TargetScopeStatus;
}
