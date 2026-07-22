import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  KNOWLEDGE_BASE_ENTRY_KINDS,
  type CreateKnowledgeBaseNoteRequestDto as CreateShape,
  type KnowledgeBaseChecklistItem,
  type KnowledgeBaseEntryKind,
  type ListKnowledgeBaseNotesQueryDto as ListShape,
  type SaveConversationSnapshotRequestDto as SaveSnapshotShape,
  type UpdateKnowledgeBaseNoteRequestDto as UpdateShape,
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

  @ApiPropertyOptional({ enum: KNOWLEDGE_BASE_ENTRY_KINDS })
  @IsOptional()
  @IsIn(KNOWLEDGE_BASE_ENTRY_KINDS)
  kind?: KnowledgeBaseEntryKind;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'CVE-2024-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  cveId?: string;
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

  @ApiPropertyOptional({ enum: KNOWLEDGE_BASE_ENTRY_KINDS })
  @IsOptional()
  @IsIn(KNOWLEDGE_BASE_ENTRY_KINDS)
  kind?: KnowledgeBaseEntryKind;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'CVE-2024-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  cveId?: string;
}

export class ListKnowledgeBaseNotesQueryParamsDto implements ListShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() findingId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() reportId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: KNOWLEDGE_BASE_ENTRY_KINDS })
  @IsOptional()
  @IsIn(KNOWLEDGE_BASE_ENTRY_KINDS)
  kind?: KnowledgeBaseEntryKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tag?: string;
}

export class SaveConversationSnapshotDto implements SaveSnapshotShape {
  @ApiProperty() @IsUUID() conversationId!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
