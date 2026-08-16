import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type {
  AccessShareLinkRequestDto as AccessShareLinkShape,
  CreateShareLinkRequestDto as CreateShareLinkShape,
  SharePermission,
  ShareResourceType,
} from '@pentesthub/shared';

const SHARE_RESOURCE_TYPES: ShareResourceType[] = ['REPORT', 'FINDING', 'EVIDENCE', 'DASHBOARD', 'PROJECT'];
const SHARE_PERMISSIONS: SharePermission[] = ['VIEW', 'COMMENT'];

export class CreateShareLinkDto implements CreateShareLinkShape {
  @ApiProperty({ enum: SHARE_RESOURCE_TYPES }) @IsIn(SHARE_RESOURCE_TYPES) resourceType!: ShareResourceType;
  @ApiProperty() @IsUUID() resourceId!: string;
  @ApiPropertyOptional({ enum: SHARE_PERMISSIONS }) @IsOptional() @IsIn(SHARE_PERMISSIONS) permission?: SharePermission;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) password?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(365) expiresInDays?: number;
}

export class AccessShareLinkDto implements AccessShareLinkShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) password?: string;
}
