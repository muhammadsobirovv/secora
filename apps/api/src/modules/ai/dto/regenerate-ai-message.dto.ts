import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { RegenerateAiMessageRequestDto as RegenerateAiMessageShape } from '@pentesthub/shared';

export class RegenerateAiMessageDto implements RegenerateAiMessageShape {
  @ApiProperty()
  @IsUUID()
  messageId!: string;
}
