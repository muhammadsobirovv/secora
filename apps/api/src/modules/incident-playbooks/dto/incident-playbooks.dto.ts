import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import type { RunPlaybookAgainstIncidentRequestDto } from '@pentesthub/shared';

export class RunPlaybookAgainstIncidentDto implements RunPlaybookAgainstIncidentRequestDto {
  @ApiProperty() @IsString() incidentId!: string;
  @ApiProperty() @IsString() playbookId!: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() variableValues?: Record<string, unknown>;
}
