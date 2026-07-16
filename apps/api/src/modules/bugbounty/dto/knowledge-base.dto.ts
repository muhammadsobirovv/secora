import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  CreateKnowledgeBaseNoteRequestDto as CreateShape,
  KnowledgeBaseChecklistItem,
  ListKnowledgeBaseNotesQueryDto as ListShape,
  UpdateKnowledgeBaseNoteRequestDto as UpdateShape,
} from '@pentesthub/shared';

export class ChecklistItemDto implements KnowledgeBaseChecklistItem {
  @ApiProperty() @IsString() text!: string;

  @ApiProperty() @IsBoolean() done!: boolean;
}

export class CreateKnowledgeBaseNoteDto implements CreateShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() findingId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() reportId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty() @IsString() contentMarkdown!: string;

  @ApiPropertyOptional({ type: [ChecklistItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
}

export class UpdateKnowledgeBaseNoteDto implements UpdateShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() findingId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() reportId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() contentMarkdown?: string;

  @ApiPropertyOptional({ type: [ChecklistItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
}

export class ListKnowledgeBaseNotesQueryParamsDto implements ListShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() findingId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() reportId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(20