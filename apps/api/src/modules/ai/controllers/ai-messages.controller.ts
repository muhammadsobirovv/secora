import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import type { AiMessageDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { SetFlagDto } from '../dto/set-flag.dto.js';
import { BookmarkAiMessageCommand } from '../commands/bookmark-ai-message.command.js';
import { PinAiMessageCommand } from '../commands/pin-ai-message.command.js';
import { DeleteAiMessageCommand } from '../commands/delete-ai-message.command.js';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/messages')
export class AiMessagesController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post(':messageId/bookmark')
  @ApiOperation({ summary: 'Bookmark or unbookmark a message' })
  bookmark(
    @Param('messageId') messageId: string,
    @Body() dto: SetFlagDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AiMessageDto> {
    return this.commandBus.execute(
      new BookmarkAiMessageCommand(user.id, messageId, dto.value),
    );
  }

  @Post(':messageId/pin')
  @ApiOperation({ summary: 'Pin or unpin a message' })
  pin(
    @Param('messageId') messageId: string,
    @Body() dto: SetFlagDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AiMessageDto> {
    return this.commandBus.execute(
      new PinAiMessageCommand(user.id, messageId, dto.value),
    );
  }

  @Delete(':messageId')
  @ApiOperation({ summary: 'Delete a message' })
  delete(
    @Param('messageId') messageId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new DeleteAiMessageCommand(user.id, messageId),
    );
  }
}
