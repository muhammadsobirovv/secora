import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  DecideSecurityApprovalRequestDto,
  StartIncidentInvestigationRequestDto,
} from '@pentesthub/shared';

export class StartIncidentInvestigationDto implements StartIncidentInvestigationRequestDto {
  @ApiProperty() @IsString() incidentId!: string;
  @ApiProperty({ maxLength: 2000 }) @IsString() @MaxLength(2000) goal!: string;
}

export class DecideIncidentInvestigationDto implements DecideSecurityApprovalRequestDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) decisionNote?: string;
}
