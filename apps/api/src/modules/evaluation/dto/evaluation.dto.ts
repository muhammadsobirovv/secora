import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type {
  EvaluationMetricType,
  EvaluationSubjectType,
  ListEvaluationRunsQueryDto as ListRunsShape,
  RunEvaluationRequestDto as RunShape,
} from '@pentesthub/shared';

const EVALUATION_METRIC_TYPES: EvaluationMetricType[] = [
  'RESPONSE_QUALITY',
  'HALLUCINATION_RATE',
  'TOOL_SUCCESS_RATE',
  'WORKFLOW_SUCCESS',
  'EXECUTION_TIME',
  'PROMPT_EFFECTIVENESS',
  'PROVIDER_COMPARISON',
];
const EVALUATION_SUBJECT_TYPES: EvaluationSubjectType[] = ['PROMPT', 'AGENT', 'WORKFLOW', 'PROVIDER', 'MCP_TOOL'];

export class RunEvaluationDto implements RunShape {
  @ApiProperty({ enum: EVALUATION_METRIC_TYPES }) @IsIn(EVALUATION_METRIC_TYPES) metricType!: EvaluationMetricType;
  @ApiProperty({ enum: EVALUATION_SUBJECT_TYPES }) @IsIn(EVALUATION_SUBJECT_TYPES) subjectType!: EvaluationSubjectType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) provider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) model?: string;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() input?: Record<string, unknown>;
}

export class ListEvaluationRunsQueryParamsDto implements ListRunsShape {
  @ApiPropertyOptional({ enum: EVALUATION_METRIC_TYPES }) @IsOptional() @IsIn(EVALUATION_METRIC_TYPES) metricType?: EvaluationMetricType;
  @ApiPropertyOptional({ enum: EVALUATION_SUBJECT_TYPES }) @IsOptional() @IsIn(EVALUATION_SUBJECT_TYPES) subjectType?: EvaluationSubjectType;
  @ApiPropertyOptional() @IsOptional() @IsString() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
}
