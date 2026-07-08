import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import type { ListProjectsQueryDto as ListProjectsShape } from '@pentesthub/shared';
import type { ProjectStatus } from '../../../prisma-types.js';

const PROJECT_STATUSES: ProjectStatus[] = [
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'ARCHIVED',
];

export class ListProjectsQueryParamsDto implements ListProjectsShape {
  @ApiPropertyOptional({ enum: PROJECT_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  favoritesOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tagId?: string;
}
