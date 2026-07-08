import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { CreateProjectRequestDto as CreateProjectShape } from '@pentesthub/shared';
import type {
  ProjectStatus,
  ProjectVisibility,
} from '../../../prisma-types.js';

const PROJECT_STATUSES: ProjectStatus[] = [
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'ARCHIVED',
];
const PROJECT_VISIBILITIES: ProjectVisibility[] = [
  'PRIVATE',
  'WORKSPACE',
  'PUBLIC',
];

export class CreateProjectDto implements CreateProjectShape {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: PROJECT_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatus;

  @ApiPropertyOptional({ enum: PROJECT_VISIBILITIES })
  @IsOptional()
  @IsIn(PROJECT_VISIBILITIES)
  visibility?: ProjectVisibility;
}
