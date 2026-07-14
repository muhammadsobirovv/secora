import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { SendAiMessageRequestDto as SendAiMessageShape } from '@pentesthub/shared';

export class SendAiMessageDto implements SendAiMessageShape {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  content!: string;
}
