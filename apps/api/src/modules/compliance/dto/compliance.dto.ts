import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  BACKUP_FREQUENCIES,
  type BackupFrequency,
  type ComplianceExportScope,
  type CreateComplianceExportRequestDto,
  type UpsertBackupPolicyRequestDto,
  type UpsertDataRetentionPolicyRequestDto,
} from '@pentesthub/shared';

export class UpsertDataRetentionPolicyDto implements UpsertDataRetentionPolicyRequestDto {
  @ApiProperty() @IsString() @MaxLength(64) resourceType!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(3650) retentionDays!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoDelete?: boolean;
}

export class UpsertBackupPolicyDto implements UpsertBackupPolicyRequestDto {
  @ApiProperty({ enum: BACKUP_FREQUENCIES }) @IsIn(BACKUP_FREQUENCIES) frequency!: BackupFrequency;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(365) retentionCount?: number;
}

export class CreateComplianceExportDto implements CreateComplianceExportRequestDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  scope?: ComplianceExportScope;
}
