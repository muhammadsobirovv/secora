import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  CreatePromptTemplateVersionRequestDto as CreatePromptTemplateVersionShape,
  ImportPromptTemplatesRequestDto as ImportPromptTemplatesShape,
  PromptTemplateExportDto as PromptTemplateExportShape,
  RatePromptTestRunRequestDto as RatePromptTestRunShape,
  RunPromptTestRequestDto as RunPromptTestShape,
} from '@pentesthub/shared';

/// Module 13 — Prompt Registry request DTOs (task #280). Same
/// class-validator conventions as create-prompt-template.dto.ts.

export class CreatePromptTemplateVersionDto implements CreatePromptTemplateVersionShape {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  promptText!: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  variables?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changelog?: string;
}

export class RunPromptTestDto implements RunPromptTestShape {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  version?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  inputVariables?: Record<string, string>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  model?: string;
}

export class RatePromptTestRunDto implements RatePromptTestRunShape {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingScore!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class PromptTemplateExportItemDto implements PromptTemplateExportShape {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  description!: string | null;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  category!: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  promptText!: string;

  @ApiProperty({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  variables!: string[] | null;
}

export class ImportPromptTemplatesDto implements ImportPromptTemplatesShape {
  @ApiProperty({ type: [PromptTemplateExportItemDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PromptTemplateExportItemDto)
  templates!: PromptTemplateExportItemDto[];
}
