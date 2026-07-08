import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { AddProjectMemberRequestDto as AddProjectMemberShape } from '@pentesthub/shared';
import type { ProjectMemberRole } from '../../../prisma-types.js';

const PROJECT_MEMBER_ROLES: ProjectMemberRole[] = [
  'OWNER',
  'CONTRIBUTOR',
  'VIEWER',
];

export class AddProjectMemberDto implements AddProjectMemberShape {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ enum: PROJECT_MEMBER_ROLES })
  @IsOptional()
  @IsIn(PROJECT_MEMBER_ROLES)
  role?: ProjectMemberRole;
}
