import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type {
  CorrectGrammarRequestDto as CorrectShape,
  ReviewReportQualityRequestDto as ReviewShape,
} from '@pentesthub/shared';

type CorrectGrammarField = CorrectShape['field'];

const CORRECT_GRAMMAR_FIELDS: CorrectGrammarField[] = [
  'summary',
  'impact',
  'stepsToReproduce',
  'proofOfConcept',
  'mitigation',
];

export class CorrectGrammarDto implements CorrectShape {
  @ApiProperty({ enum: CORRECT_GRAMMAR_FIELDS })
  @IsIn(CORRECT_GRAMMAR_FIELDS)
  field!: CorrectGrammarField;

  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
}

export class ReviewReportQualityDto implements ReviewShape {
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
}
