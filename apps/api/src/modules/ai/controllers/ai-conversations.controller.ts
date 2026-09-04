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
import { BranchAiMessageDto } from '../dto/branch-ai-message.dto.js';
import { SetFlagDto } from '../dto/set-flag.dto.js';
import { CreateAiConversationCommand } from '../commands/create-ai-conversation.command.js';
import { DeleteAiConversationCommand } from '../commands/delete-ai-conversation.command.js';
import { PinAiConversationCommand } from '../commands/pin-ai-conversation.command.js';
import { ArchiveAiConversationCommand } from '../commands/archive-ai-conversation.command.js';
import { SendAiMessageCommand } from '../commands/send-ai-message.command.js';
import { BranchAiMessageCommand } from '../commands/branch-ai-message.command.js';
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
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import {
  resolveAiMessageForCaller,
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
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
    // Module 18 — task #517 (SSE hardening). Both added solely so
    // streamMessage() below can authorize the connection — see that
    // method's comment.
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
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

  /// Module 11 — AI Chat conversation branching. See
  /// AiChatService.branchTurn's doc comment for the branching model.
  @Post(':conversationId/messages/branch')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Fork a new message off an earlier one — creates a user + placeholder assistant message sharing parentMessageId and starts generation',
  })
  branchMessage(
    @Param('conversationId') conversationId: string,
    @Body() dto: BranchAiMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ userMessage: AiMessageDto; assistantMessage: AiMessageDto }> {
    return this.commandBus.execute(
      new BranchAiMessageCommand(
        user.id,
        conversationId,
        dto.parentMessageId,
        dto.content,
      ),
    );
  }

  @Get(':conversationId/messages/:messageId/branches')
  @ApiOperation({ summary: 'List every message branched off a given message' })
  async listBranches(
    @Param('messageId') messageId: string,
  ): Promise<AiMessageDto[]> {
    const branches = await this.messagesRepository.listBranches(messageId);
    return branches.map((m) => toAiMessageDto(m));
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
  // Module 18 — task #512 (rate limiting audit). No dedicated limit on new
  // *connection attempts* to this endpoint before — only the send/branch/
  // regenerate/continue endpoints above that actually start generation
  // were throttled. This doesn't cap concurrent *open* streams (the
  // Throttler only sees the initial request, not a long-lived SSE
  // connection's lifetime — capping concurrent opens would need a
  // separate in-memory/Redis counter, out of proportion to this audit),
  // but it does bound how fast a client can open/reconnect streams,
  // which is the cheap-to-fix half of the gap the audit found here.
  // Module 18 — task #517 (SSE hardening audit). Previously had no
  // @CurrentUser() at all — `messageId` came straight from the query
  // string with zero ownership check, so any authenticated user who
  // supplied any workspace's messageId got that workspace's live
  // assistant-message token stream (via the unscoped `streamHub.get()`
  // Map lookup) or its persisted final content/error (via the unscoped
  // `messagesRepository.findById()`) — a real cross-workspace data leak,
  // the AI-chat equivalent of the same gap fixed on
  // AgentRunsController.stream() in this same phase. Now authorizes via
  // the same resolveAiMessageForCaller() every other message-touching
  // command/query in this module already goes through (see
  // GetAiConversationQuery), before ever touching the stream hub or
  // repository with the caller-supplied messageId.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Sse(':conversationId/messages/stream')
  @ApiOperation({
    summary: 'Live SSE stream of one assistant message being generated',
  })
  streamMessage(
    @Param('conversationId') conversationId: string,
    @Query('messageId') messageId: string,
    @CurrentUser() user: RequestUser,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let cancelled = false;
      let innerSubscription: { unsubscribe(): void } | undefined;

      void resolveAiMessageForCaller(
        this.conversationsRepository,
        this.messagesRepository,
        this.workspacesRepository,
        user.id,
        messageId,
      )
        .then(({ message, conversation }) => {
          if (cancelled) return;
          // Defense in depth: the route's own :conversationId must match
          // the message's actual conversation, not just belong to the
          // same workspace as the caller.
          if (conversation.id !== conversationId) {
            subscriber.error(new NotFoundException('Message not found'));
            return;
          }

          const active = this.streamHub.get(messageId);
          if (active) {
            innerSubscription = active.subject
              .asObservable()
              .pipe(map((event) => ({ data: event })))
              .subscribe(subscriber);
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
        })
        .catch((error: unknown) => subscriber.error(error));

      return () => {
        cancelled = true;
        innerSubscription?.unsubscribe();
      };
    });
  }
}
