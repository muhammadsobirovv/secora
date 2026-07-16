import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type {
  ClassifyScopeRequestDto as ClassifyShape,
  CreateScopeItemRequestDto as CreateShape,
  ScopeClassification,
  ScopeItemType,
  UpdateScopeItemRequestDto as UpdateShape,
} from '@pentesthub/shared';

export const SCOPE_ITEM_TYPES: ScopeItemType[] = [
  'DOMAIN',
  'WILDCARD',
  'URL',
  'MOBILE_APP',
  'API',
  'CIDR',
  'IP_RANGE',
  'ASN',
  'CLOUD_ASSET',
];

export const SCOPE_CLASSIFICATIONS: ScopeClassification[] = [
  'IN_SCOPE',
  'OUT_OF_SCOPE',
  'UNKNOWN',
];

export class CreateScopeItemDto implements CreateShape {
  @ApiProperty({ enum: SCOPE_ITEM_TYPES })
  @IsIn(SCOPE_ITEM_TYPES)
  type!: ScopeItemType;

  @ApiProperty({ maxLength: 500 }) @IsString() @MaxLength(500) pattern!: string;

  @ApiPropertyOptional({ enum: SCOPE_CLASSIFICATIONS })
  @IsOptional()
  @IsIn(SCOPE_CLASSIFICATIONS)
  classification?: ScopeClassification;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateScopeItemDto implements UpdateShape {
  @ApiPropertyOptional({ enum: SCOPE_CLASSIFICATIONS })
  @IsOptional()
  @IsIn(SCOPE_CLASSIFICATIONS)
  classification?: ScopeClassification;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class ClassifyScopeDto implements ClassifyShape {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;
}

export class LinkProgramTargetDto {
  @ApiProperty() @IsUUID() targetId!