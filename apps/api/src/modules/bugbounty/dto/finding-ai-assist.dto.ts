import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import type {
  CalculateSeverityRequestDto as CalculateSeverityShape,
  GenerateImpactRequestDto as GenerateImpactShape,
  GeneratePocRequestDto as GeneratePocShape,
  GenerateRemediationRequestDto as GenerateRemediationShape,
  GenerateReproStepsRequestDto as GenerateReproStepsShape,
  ReviewFindingRequestDto as ReviewFindingShape,
  SuggestPayloadsRequestDto as SuggestPayloadsShape,
} from '@pentesthub/shared';

/// Every finding-scoped AI endpoint takes the same optional
/// provider/model override — one base class rather than 6 near-identical
/// ones.
class AiProviderOverrideDto {
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
}

export class ReviewFindingDto extends AiProviderOverrideDto implements ReviewFindingShape {}

export class GeneratePocDto extends AiProviderOverrideDto implements GeneratePocShape {}

export class GenerateReproStepsDto extends AiProviderOverrideDto implements GenerateReproStepsShape {}

export class GenerateImpactDto extends AiProviderOverrideDto implements GenerateImpactShape {}

export class GenerateRemediationDto extends AiProviderOverrideDto implements GenerateRemediationShape {}

export class CalculateSeverityDto extends AiProviderOverrideDto implements CalculateSeverityShape {}

export class SuggestPayloadsDto extends AiProviderOverrideDto implements SuggestPayloadsShape {
  @ApiPropertyOptional() @IsOptional() @IsString() vulnType?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() context?: string;
}
