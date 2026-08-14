import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString } from 'class-validator';
import type { FeatureFlagScopeType, SetFeatureFlagOverrideRequestDto } from '@pentesthub/shared';

const SCOPE_TYPES: FeatureFlagScopeType[] = ['ORGANIZATION', 'WORKSPACE', 'USER'];

export class SetFeatureFlagOverrideDto implements SetFeatureFlagOverrideRequestDto {
  @ApiProperty()
  @IsString()
  featureFlagId!: string;

  @ApiProperty({ enum: SCOPE_TYPES })
  @IsIn(SCOPE_TYPES)
  scopeType!: FeatureFlagScopeType;

  @ApiProperty({ description: 'The organizationId/workspaceId/userId this override applies to' })
  @IsString()
  scopeId!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
