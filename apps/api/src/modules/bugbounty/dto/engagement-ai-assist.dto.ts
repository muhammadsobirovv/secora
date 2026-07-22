import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import type {
  SuggestAttackPathsRequestDto as SuggestAttackPathsShape,
  SummarizeEngagementRequestDto as SummarizeEngagementShape,
} from '@pentesthub/shared';

export class SuggestAttackPathsDto implements SuggestAttackPathsShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() targetId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() findingId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
}

export class SummarizeEngagementDto implements SummarizeEngagementShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
}
