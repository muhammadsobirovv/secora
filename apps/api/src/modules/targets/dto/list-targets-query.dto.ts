import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { ListTargetsQueryDto as ListTargetsShape } from '@pentesthub/shared';
import type { TargetScopeStatus, TargetType } from '../../../prisma-types.js';

const TARGET_TYPES: TargetType[] = [
  'DOMAIN',
  'SUBDOMAIN',
  'URL',
  'IP_ADDRESS',
  'CIDR',
  'API',
  'MOBILE_APP',
  'INTERNAL_ASSET',
];
const TARGET_SCOPE_STATUSES: TargetScopeStatus[] = [
  'IN_SCOPE',
  'OUT_OF_SCOPE',
  'PENDING_REVIEW',
];

export class ListTargetsQueryParamsDto implements ListTargetsShape {
  @ApiPropertyOptional({ enum: TARGET_TYPES })
  @IsOptional()
  @IsIn(TARGET_TYPES)
  type?: TargetType;

  @ApiPropertyOptional({ enum: TARGET_SCOPE_STATUSES })
  @IsOptional()
  @IsIn(TARGET_SCOPE_STATUSES)
  scopeStatus?: TargetScopeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tagId?: string;
}
