import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { KnowledgeGraphNodeType } from '@pentesthub/shared';

export const KNOWLEDGE_GRAPH_NODE_TYPES: KnowledgeGraphNodeType[] = [
  'TARGET',
  'TECHNOLOGY',
  'CVE',
  'FINDING',
  'EVIDENCE',
  'REPORT',
  'NOTE',
  'AI_CONVERSATION',
  'PLUGIN',
  'KNOWLEDGE_DOCUMENT',
];

export class KnowledgeGraphSearchQueryParamsDto {
  @ApiProperty() @IsString() @MaxLength(200) query!: string;
  @ApiPropertyOptional({ enum: KNOWLEDGE_GRAPH_NODE_TYPES, isArray: true, description: 'Comma-separated, e.g. "TARGET,FINDING"' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()) : value))
  @IsArray()
  @IsIn(KNOWLEDGE_GRAPH_NODE_TYPES, { each: true })
  types?: KnowledgeGraphNodeType[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
}

export class KnowledgeGraphPathQueryParamsDto {
  @ApiProperty({ enum: KNOWLEDGE_GRAPH_NODE_TYPES }) @IsIn(KNOWLEDGE_GRAPH_NODE_TYPES) fromType!: KnowledgeGraphNodeType;
  @ApiProperty() @IsString() fromId!: string;
  @ApiProperty({ enum: KNOWLEDGE_GRAPH_NODE_TYPES }) @IsIn(KNOWLEDGE_GRAPH_NODE_TYPES) toType!: KnowledgeGraphNodeType;
  @ApiProperty() @IsString() toId!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) maxDepth?: number;
}
