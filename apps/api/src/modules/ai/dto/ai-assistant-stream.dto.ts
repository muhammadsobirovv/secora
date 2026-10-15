import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AiAssistantMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @MaxLength(8000)
  content!: string;
}

/// Body for POST /ai/assistant/stream — the floating Secora AI helper sends
/// its recent turns each time (nothing is stored server-side).
export class AiAssistantStreamDto {
  @ApiProperty({ type: [AiAssistantMessageDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AiAssistantMessageDto)
  messages!: AiAssistantMessageDto[];
}
