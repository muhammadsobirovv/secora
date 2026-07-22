import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type {
  CreateReportScheduleRequestDto as CreateScheduleShape,
  EnterpriseReportType,
  GenerateEnterpriseReportRequestDto as GenerateReportShape,
  UpdateReportScheduleRequestDto as UpdateScheduleShape,
} from '@pentesthub/shared';

const REPORT_TYPES: EnterpriseReportType[] = ['EXECUTIVE', 'TECHNICAL', 'COMPLIANCE', 'AUDIT', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'CUSTOM'];

export class GenerateEnterpriseReportDto implements GenerateReportShape {
  @ApiProperty({ enum: REPORT_TYPES }) @IsIn(REPORT_TYPES) type!: EnterpriseReportType;
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() periodStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() periodEnd?: string;
}

export class CreateReportScheduleDto implements CreateScheduleShape {
  @ApiProperty({ enum: REPORT_TYPES }) @IsIn(REPORT_TYPES) type!: EnterpriseReportType;
  @ApiProperty() @IsString() cronExpression!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayNotEmpty() @IsString({ each: true }) recipients!: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
}

export class UpdateReportScheduleDto implements UpdateScheduleShape {
  @ApiPropertyOptional() @IsOptional() @IsString() cronExpression?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) recipients?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
