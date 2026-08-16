import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsPositive, IsString } from 'class-validator';
import type { CreateSecurityApprovalRequestDto } from '@pentesthub/shared';

export class CreateSecurityApprovalDto implements CreateSecurityApprovalRequestDto {
  @ApiProperty() @IsString() operationType!: string;
  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  riskLevel!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  @ApiProperty() @IsString() resourceType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() payload?: unknown;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() expiresInMinutes?: number;
}

export class DecideSecurityApprovalDto {
  @ApiProperty() approve!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() decisionNote?: string;
}

export class UpdateGlobalSecurityPolicyDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() maxScanRatePerMinute?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxConcurrentJobs?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() allowedTools?: string[] | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() blockedTools?: string[] | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() allowedTargetTypes?: string[] | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() requireApprovalFor?: string[] | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() dataRetentionDays?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() evidenceRetentionDays?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() aiToolPermissions?: Record<string, boolean> | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() pluginPermissions?: Record<string, boolean> | null;
}
