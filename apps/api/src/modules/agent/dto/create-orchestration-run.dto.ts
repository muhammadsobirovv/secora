import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { CreateOrchestrationRunRequestDto as CreateOrchestrationRunShape } from '@pentesthub/shared';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
export class CreateOrchestrationRunDto implements CreateOrchestrationRunShape {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  goal!: string;
}
