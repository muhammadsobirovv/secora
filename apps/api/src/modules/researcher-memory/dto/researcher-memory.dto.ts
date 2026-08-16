import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  CreateResearcherMemoryEntryRequestDto as CreateShape,
  ResearcherMemoryKind,
  UpdateResearcherMemoryEntryRequestDto as UpdateShape,
} from '@pentesthub/shared';

const RESEARCHER_MEMORY_KINDS: ResearcherMemoryKind[] = [
  'PREFERENCE',
  'PROJECT_CONTEXT',
  'NOTE',
  'IMPORTANT_FINDING',
  'DECISION',
  'CUSTOM_INSTRUCTION',
];

export class CreateResearcherMemoryEntryDto implements CreateShape {
  @ApiProperty({ enum: RESEARCHER_MEMORY_KINDS }) @IsIn(RESEARCHER_MEMORY_KINDS) kind!: ResearcherMemoryKind;
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiProperty() @IsString() @MaxLength(20000) content!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateResearcherMemoryEntryDto implements UpdateShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) content?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

export class ListResearcherMemoryEntriesQueryParamsDto {
  @ApiPropertyOptional({ enum: RESEARCHER_MEMORY_KINDS }) @IsOptional() @IsIn(RESEARCHER_MEMORY_KINDS) kind?: ResearcherMemoryKind;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;
}
