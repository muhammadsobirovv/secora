import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { UpdateWorkspaceSettingsRequestDto as UpdateWorkspaceSettingsShape } from '@pentesthub/shared';
import type { ProjectStatus } from '../../../prisma-types.js';

const PROJECT_STATUSES: ProjectStatus[] = [
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'ARCHIVED',
];

export class UpdateWorkspaceSettingsDto implements UpdateWorkspaceSettingsShape {
  @ApiPropertyOptional({ enum: PROJECT_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  defaultProjectStatus?: ProjectStatus;
}
