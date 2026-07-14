import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/// Shared body shape for the continue/cancel actions (both just need to
/// identify which assistant message to act on) — regenerate uses its own
/// RegenerateAiMessageDto to match the shared-package request type
/// exactly, but continue/cancel have no dedicated shared DTO since
/// they're not part of packages/shared's typed request surface.
export class MessageIdDto {
  @ApiProperty()
  @IsUUID()
  messageId!: string;
}
