import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpsertAiProviderCredentialRequestDto as UpsertAiProviderCredentialShape } from '@pentesthub/shared';

export class UpsertAiProviderCredentialDto
  implements UpsertAiProviderCredentialShape
{
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;
}
