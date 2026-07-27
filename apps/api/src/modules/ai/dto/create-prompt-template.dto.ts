import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { CreatePromptTemplateRequestDto as CreatePromptTemplateShape } from '@pentesthub/shared';

export class CreatePromptTemplateDto implements CreatePromptTemplateShape {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  promptText!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}
