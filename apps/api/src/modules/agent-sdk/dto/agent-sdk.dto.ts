import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type {
  AgentSdkManifest,
  AgentSdkRunStatus,
  RegisterAgentSdkDefinitionRequestDto as RegisterShape,
  StartAgentSdkRunRequestDto as StartRunShape,
} from '@pentesthub/shared';

/// Module 13 — AI Agent SDK request DTOs (task #281).

export class RegisterAgentSdkDefinitionDto implements RegisterShape {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'slug must be lowercase kebab-case' })
  slug!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ type: 'object' })
  @IsObject()
  manifest!: AgentSdkManifest;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  sourceCode?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  permissions!: string[];
}

export class StartAgentSdkRunDto implements StartRunShape {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  agentSdkDefinitionId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({ required: false, type: 'object' })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

export class ListAgentSdkRunsQueryParamsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  agentSdkDefinitionId?: string;

  @ApiProperty({ required: false, enum: ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'])
  status?: AgentSdkRunStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
