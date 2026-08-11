import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type {
  ApproveWorkflowStepRequestDto,
  CreateWorkflowRequestDto,
  TriggerWorkflowRequestDto,
  UpdateWorkflowRequestDto,
  WorkflowDefinition,
  WorkflowTriggerType,
} from '@pentesthub/shared';

const TRIGGER_TYPES: WorkflowTriggerType[] = ['MANUAL', 'SCHEDULE', 'EVENT', 'WEBHOOK'];

export class CreateWorkflowDto implements CreateWorkflowRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() workspaceId?: string;
  @ApiProperty() @IsString() @MaxLength(150) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  // The definitionJson graph is structurally complex (recursive step
  // list) — validated at runtime by
  // workflow-definition.schema.ts's Zod schema inside the command
  // handler rather than with class-validator decorators here (Zod's
  // z.lazy() recursive schema is a much better fit than nested
  // @ValidateNested() nightmare for a graph of variable-shaped step
  // params).
  @ApiProperty({ type: 'object' }) @IsObject() definition!: WorkflowDefinition;
  @ApiProperty({ enum: TRIGGER_TYPES }) @IsIn(TRIGGER_TYPES) triggerType!: WorkflowTriggerType;
  @ApiPropertyOptional() @IsOptional() @IsString() cronExpression?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateWorkflowDto implements UpdateWorkflowRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ type: 'object' }) @IsOptional() @IsObject() definition?: WorkflowDefinition;
  @ApiPropertyOptional({ enum: TRIGGER_TYPES }) @IsOptional() @IsIn(TRIGGER_TYPES) triggerType?: WorkflowTriggerType;
  @ApiPropertyOptional() @IsOptional() @IsString() cronExpression?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class TriggerWorkflowDto implements TriggerWorkflowRequestDto {
  @ApiPropertyOptional({ type: 'object' }) @IsOptional() @IsObject() input?: Record<string, unknown>;
}

export class ApproveWorkflowStepDto implements ApproveWorkflowStepRequestDto {
  @ApiProperty() @IsBoolean() approved!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
