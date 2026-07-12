import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { PromoteFindingRequestDto as PromoteFindingShape } from '@pentesthub/shared';
import type { TargetScopeStatus } from '../../../prisma-types.js';

const TARGET_SCOPE_STATUSES: TargetScopeStatus[] = [
  'IN_SCOPE',
  'OUT_OF_SCOPE',
  'PENDING_REVIEW',
];

export class PromoteFindingDto implements PromoteFindingShape {
  @ApiPropertyOptional({ enum: TARGET_SCOPE_STATUSES })
  @IsOptional()
  @IsIn(TARGET_SCOPE_STATUSES)
  scopeStatus?: TargetScopeStatus;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
