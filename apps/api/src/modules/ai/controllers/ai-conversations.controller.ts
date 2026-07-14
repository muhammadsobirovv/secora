import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import { Observable, map } from 'rxjs';
import type {
  AiConversationDetailDto,
  AiConversationDto,
  AiMessageDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateAiConversationDto } from '../dto/create-ai-conversation.dto.js';
import { ListAiConversationsQueryParamsDto } from '../dto/list-ai-conversations-query.dto.js';
import { SendAiMessageDto } from '../dto/send-ai-message.dto.js';
import { RegenerateAiMessageDto } from '../dto/regenerate-ai-message.dto.js';
import { MessageIdDto } from '../dto/message-id.dto.js';
import { SetFlagDto } from '../dto/set-flag.dto.js';
import { CreateAiConversationCommand } from '../commands/create-ai-conversation.command.js';
import { DeleteAiConversationCommand } from '../commands/delete-ai-conversation.command.js';
import { PinAiConversationCommand } from '../commands/pin-ai-conversation.command.js';
import { ArchiveAiConversationCommand } from '../commands/archive-ai-conversation.command.js';
import { SendAiMessageCommand } from '../commands/send-ai-message.command.js';
import { RegenerateAiMessageCommand } from '../commands/regenerate-ai-message.command.js';
import { ContinueAiMessageCommand } from '../commands/continue-ai-message.command.js';
import { CancelAiGenerationCommand } from '../commands/cancel-ai-generation.command.js';
import { GetAiConversationQuery } from '../queries/get-ai-conversation.query.js';
import { ListAiConversationsQuery } from '../queries/list-ai-conversations.query.js';
import { AiChatStreamHubService } from '../chat/ai-chat-stream-hub.service.js';
import {
  AI_MESSAGES_REPOSITORY,
  type AiMessagesRepository,
} from '../domain/repositories/ai-messages.repository.interface.js';
import { toAiMessageDto } from '../mappers/to-ai-message-dto.mapper.js';
import type { AiChatStreamEvent } from '../chat/ai-chat-stream-event.js';

/// AI conversations + the message-streaming lifecycle. Message-sending
/// endpoints carry a tighter Throttle than the global default (Security:
/// Rate Limiting) — a single turn is far more expensive (provider $ +
/// latency) than a typical CRUD request, same reasoning as auth's
/// register endpoint.
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/conversations')
export class AiConversationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly streamHub: AiChatStreamHubService,
    @Inject(AI_MESSAGES_REPOSITORY)
    private readonly messagesRepository: AiMessagesRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List AI conversations' })
  list(
    @Query() query: ListAiConversationsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AiConversationDto[]> {
    return this.queryBus.execute(
      new ListAiConversationsQuery(
        user.id,
        query.projectId,
        query.search,
        query.pinned,
        query.limit,
      ),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a new AI conversation' })
  create(
    @Body() dto: CreateAiConversationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AiConversationDto> {
    return this.commandBus.execute(
      new CreateAiConversationCommand(
        user.id,
        dto.projectId,
        dto.title,
        dto.provider,
        dto.model,
      ),
    );
  }

  @Get(':conversationId')
  @ApiOperation({ summary: 'Get a conversation with its full message history' })
  get(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AiConversationDetailDto> {
    return this.queryBus.execute(
      new GetAiConversationQuery(user.id, conversationId),
    );
  }

  @Delete(':conversationId')
  @ApiOperation({ summary: 'Delete a conversation' })
  delete(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new DeleteAiConversationCommand(user.id, conversationId),
    );
  }

  @Post(':conversationId/pin')
  @ApiOperation({ summary: 'Pin or unpin a conversation' })
  pin(
    @Param('conversationId') conversationId: string,
    @Body() dto: SetFlagDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AiConversationDto> {
    return this.commandBus.execute(
      new PinAiConversationCommand(user.id, conversationId, dto.value),
    );
  }

  @Post(':conversationId/archive')
  @ApiOperation({ summary: 'Archive or unarchive a conversation' })
  archive(
    @Param('conversationId') conversationId: string,
    @Body() dto: SetFlagDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AiConversationDto> {
    return this.commandBus.execute(
      new ArchiveAiConversationCommand(user.id, conversationId, dto.value),
    );
  }

  @Post(':conversationId/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Send a message — creates the user + placeholder assistant message and starts generation',
  })
  sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() dto: SendAiMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ userMessage: AiMessageDto; assistantMessage: AiMessageDto }> {
    return this.commandBus.execute(
      new SendAiMessageCommand(user.id, conversationId, dto.content),
    );
  }

  @Post(':conversationId/messages/regenerate')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Regenerate an assistant message' })
  regenerate(
    @Param('conversationId') conversationId: string,
    @Body() dto: RegenerateAiMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AiMessageDto> {
    return this.commandBus.execute(
      new RegenerateAiMessageCommand(user.id, conversationId, dto.messageId),
    );
  }

  @Post(':conversationId/messages/continue')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Continue a truncated assistant message' })
  continueMessage(
    @Param('conversationId') conversationId: string,
    @Body() dto: MessageIdDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AiMessageDto> {
    return this.commandBus.execute(
      new ContinueAiMessageCommand(user.id, conversationId, dto.messageId),
    );
  }

  @Post(':conversationId/messages/cancel')
  @ApiOperation({ summary: 'Cancel an in-progress generation' })
  cancel(
    @Body() dto: MessageIdDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ cancelled: boolean }> {
    return this.commandBus.execute(
      new CancelAiGenerationCommand(user.id, dto.messageId),
    );
  }

  /// Live token stream for one assistant message (Streaming Chat). Reads
  /// from the in-process AiChatStreamHub if generation is still active; if
  /// the client connects/reconnects after generation already finished
  /// (or the hub entry expired), falls back to emitting the persisted
  /// message once as a single terminal event — see
  /// AiChatStreamHubService's doc comment for the single-process caveat.
  @Sse(':conversationId/messages/stream')
  @ApiOperation({
    summary: 'Live SSE stream of one assistant message being generated',
  })
  streamMessage(
    @Param('conversationId') conversationId: string,
    @Query('messageId') messageId: string,
  ): Observable<MessageEvent> {
    const active = this.streamHub.get(messageId);
    if (active) {
      return active.subject
        .asObservable()
        .pipe(map((event) => ({ data: event })));
    }

    return new Observable<MessageEvent>((subscriber) => {
      void this.messagesRepository.findById(messageId).then((message) => {
        if (!message) {
          subscriber.error(new NotFoundException('Message not found'));
          return;
        }
        const event: AiChatStreamEvent =
          message.status === 'FAILED'
            ? {
                type: 'error',
                message: message.errorMessage ?? 'Generation failed',
              }
            : message.status === 'CANCELLED'
              ? { type: 'cancelled' }
              : { type: 'done', message: toAiMessageDto(message) };
        subscriber.next({ data: event });
        subscriber.complete();
      });
    });
  }
}
