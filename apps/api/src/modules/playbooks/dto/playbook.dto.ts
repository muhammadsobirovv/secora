import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type {
  CreatePlaybookRequestDto as CreateShape,
  DecidePlaybookApprovalRequestDto as DecideShape,
  StartPlaybookExecutionRequestDto as StartShape,
  UpdatePlaybookDraftRequestDto as UpdateShape,
} from '@pentesthub/shared';

/// `graph`/`variables` are accepted as opaque JSON here — their internal
/// shape (PlaybookGraph) is validated structurally and semantically by
/// PlaybookValidationService (graph.ts / cycle detection / tool
/// availability / etc.), not by class-validator field decorators, since a
/// step graph is a nested, step-type-dependent structure that
/// class-validator's flat decorators can't usefully express.
export class CreatePlaybookDto implements CreateShape {
  @ApiProperty({ maxLength: 200 }) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;

  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) description?: string;

  @ApiProperty({ maxLength: 100 }) @IsString() @IsNotEmpty() @MaxLength(100) category!: string;

  @ApiProperty({ type: Object }) @IsObject() graph!: CreateShape['graph'];

  @ApiPropertyOptional({ type: [Object] }) @IsOptional() @IsArray() variables?: CreateShape['variables'];
}

export class UpdatePlaybookDraftDto implements UpdateShape {
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) name?: string;

  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) description?: string;

  @ApiPropertyOptional({ maxLength: 100 }) @IsOptional() @IsString() @MaxLength(100) category?: string;

  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() graph?: UpdateShape['graph'];

  @ApiPropertyOptional({ type: [Object] }) @IsOptional() @IsArray() variables?: UpdateShape['variables'];
}

export class StartPlaybookExecutionDto implements StartShape {
  @ApiProperty() @IsUUID() targetId!: string;

  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() variableValues?: Record<string, unknown>;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDryRun?: boolean;
}

export class DecidePlaybookApprovalDto implements DecideShape {
  @ApiProperty() @IsBoolean() approve!: boolean;

  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) decisionNote?: string;
}

export class ListPlaybooksQueryParamsDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
}
