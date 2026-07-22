import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  InternalChatChannelDto,
  InternalChatMessageDto,
  ReviewQueueItemDto,
  WikiPageDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateInternalChatChannelDto,
  CreateWikiPageDto,
  DecideReviewQueueItemDto,
  SendInternalChatMessageDto,
  SubmitReviewQueueItemDto,
  UpdateWikiPageDto,
} from '../dto/team-workspace.dto.js';
import {
  CreateInternalChatChannelCommand,
  CreateWikiPageCommand,
  DecideReviewQueueItemCommand,
  DeleteWikiPageCommand,
  SendInternalChatMessageCommand,
  SubmitReviewQueueItemCommand,
  UpdateWikiPageCommand,
} from '../commands/team-workspace.commands.js';
import {
  GetWikiPageQuery,
  ListInternalChatChannelsQuery,
  ListInternalChatMessagesQuery,
  ListReviewQueueItemsQuery,
  ListWikiPagesQuery,
} from '../queries/team-workspace.query.js';

/// Team Workspace — internal wiki, lightweight review/approval queue, and
/// async internal team chat. Workspace-scoped (mirrors Module 9's
/// Collaboration routing: `/team-workspace/workspaces/:workspaceId/...`,
/// authorized via the same `resolveWorkspaceMembership` every
/// Collaboration endpoint uses), not organization-scoped — these
/// resources hang off `Workspace` directly (required FK), with
/// `organizationId` only an optional cross-team pointer.
@ApiTags('team-workspace')
@ApiBearerAuth()
@Controller('team-workspace/workspaces/:workspaceId')
export class TeamWorkspaceController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // --- Wiki -------------------------------------------------------------

  @Get('wiki-pages')
  @ApiOperation({ summary: 'List wiki pages for a workspace' })
  listWikiPages(@Param('workspaceId') workspaceId: string, @CurrentUser() user: RequestUser): Promise<WikiPageDto[]> {
    return this.queryBus.execute(new ListWikiPagesQuery(user.id, workspaceId));
  }

  @Post('wiki-pages')
  @ApiOperation({ summary: 'Create a wiki page (optionally nested under a parent page)' })
  createWikiPage(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateWikiPageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WikiPageDto> {
    return this.commandBus.execute(new CreateWikiPageCommand(user.id, { ...dto, workspaceId }));
  }

  @Get('wiki-pages/:pageId')
  @ApiOperation({ summary: 'Get a wiki page' })
  getWikiPage(
    @Param('workspaceId') workspaceId: string,
    @Param('pageId') pageId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<WikiPageDto> {
    return this.queryBus.execute(new GetWikiPageQuery(user.id, workspaceId, pageId));
  }

  @Patch('wiki-pages/:pageId')
  @ApiOperation({ summary: 'Update a wiki page' })
  updateWikiPage(
    @Param('workspaceId') workspaceId: string,
    @Param('pageId') pageId: string,
    @Body() dto: UpdateWikiPageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WikiPageDto> {
    return this.commandBus.execute(new UpdateWikiPageCommand(user.id, workspaceId, pageId, dto));
  }

  @Delete('wiki-pages/:pageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a wiki page (author, or Manager+)' })
  async deleteWikiPage(
    @Param('workspaceId') workspaceId: string,
    @Param('pageId') pageId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteWikiPageCommand(user.id, workspaceId, pageId));
  }

  // --- Review queue -------------------------------------------------------

  @Get('review-queue')
  @ApiOperation({ summary: 'List review queue items (optionally filtered by status)' })
  listReviewQueue(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<ReviewQueueItemDto[]> {
    return this.queryBus.execute(new ListReviewQueueItemsQuery(user.id, workspaceId, status));
  }

  @Post('review-queue')
  @ApiOperation({ summary: 'Submit a resource for review/approval' })
  submitReviewQueueItem(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: SubmitReviewQueueItemDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ReviewQueueItemDto> {
    return this.commandBus.execute(new SubmitReviewQueueItemCommand(user.id, { ...dto, workspaceId }));
  }

  @Post('review-queue/:itemId/decide')
  @ApiOperation({ summary: 'Approve or reject a pending review item (assignee, or Manager+)' })
  decideReviewQueueItem(
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Body() dto: DecideReviewQueueItemDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ReviewQueueItemDto> {
    return this.commandBus.execute(new DecideReviewQueueItemCommand(user.id, workspaceId, itemId, dto));
  }

  // --- Internal chat --------------------------------------------------------

  @Get('chat/channels')
  @ApiOperation({ summary: 'List internal chat channels for a workspace' })
  listChatChannels(@Param('workspaceId') workspaceId: string, @CurrentUser() user: RequestUser): Promise<InternalChatChannelDto[]> {
    return this.queryBus.execute(new ListInternalChatChannelsQuery(user.id, workspaceId));
  }

  @Post('chat/channels')
  @ApiOperation({ summary: 'Create an internal chat channel' })
  createChatChannel(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateInternalChatChannelDto,
    @CurrentUser() user: RequestUser,
  ): Promise<InternalChatChannelDto> {
    return this.commandBus.execute(new CreateInternalChatChannelCommand(user.id, { ...dto, workspaceId }));
  }

  @Get('chat/channels/:channelId/messages')
  @ApiOperation({ summary: 'List recent messages in a channel (most recent 500, oldest first)' })
  listChatMessages(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<InternalChatMessageDto[]> {
    return this.queryBus.execute(new ListInternalChatMessagesQuery(user.id, workspaceId, channelId, limit ? Number(limit) : undefined));
  }

  @Post('chat/channels/:channelId/messages')
  @ApiOperation({ summary: 'Send a message to a channel' })
  sendChatMessage(
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @Body() dto: SendInternalChatMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<InternalChatMessageDto> {
    return this.commandBus.execute(new SendInternalChatMessageCommand(user.id, workspaceId, channelId, dto));
  }
}
