import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import type { BranchAiMessageRequestDto as BranchAiMessageShape } from '@pentesthub/shared';

export class BranchAiMessageDto implements BranchAiMessageShape {
  @ApiProperty()
  @IsUUID()
  parentMessageId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  content!: string;
}
