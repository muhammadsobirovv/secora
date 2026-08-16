import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  DecideSecurityApprovalRequestDto,
  StartAiInvestigationRequestDto,
} from '@pentesthub/shared';

export class StartAiInvestigationDto implements StartAiInvestigationRequestDto {
  @ApiProperty() @IsString() targetId!: string;
  @ApiProperty({ maxLength: 2000 }) @IsString() @MaxLength(2000) goal!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() researchSessionId?: string;
}

export class DecideAiInvestigationDto implements DecideSecurityApprovalRequestDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) decisionNote?: string;
}
