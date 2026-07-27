import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { OrchestrationRunStatus } from '@pentesthub/shared';
import type { ListOrchestrationRunsQueryDto as ListOrchestrationRunsShape } from '@pentesthub/shared';

const ORCHESTRATION_RUN_STATUSES: OrchestrationRunStatus[] = [
  'PENDING',
  'PLANNING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
export class ListOrchestrationRunsQueryParamsDto implements ListOrchestrationRunsShape {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: ORCHESTRATION_RUN_STATUSES })
  @IsOptional()
  @IsIn(ORCHESTRATION_RUN_STATUSES)
  status?: OrchestrationRunStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
