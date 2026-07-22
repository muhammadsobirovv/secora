import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { CommentDto, MentionDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateCommentDto,
  ListCommentsQueryParamsDto,
  ListMentionsQueryParamsDto,
  UpdateCommentDto,
} from '../dto/collaboration.dto.js';
import {
  CreateCommentCommand,
  DeleteCommentCommand,
  MarkMentionReadCommand,
  UpdateCommentCommand,
} from '../commands/comments.commands.js';
import { ListCommentsQuery, ListMentionsQuery } from '../queries/comments.query.js';

@ApiTags('collaboration')
@ApiBearerAuth()
@Controller('collaboration/workspaces/:workspaceId/comments')
export class CommentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List comments on an entity (Program/Finding/Report/Target/Note/Task)' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListCommentsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CommentDto[]> {
    return this.queryBus.execute(new ListCommentsQuery(user.id, workspaceId, query));
  }

  @Post()
  @ApiOperation({ summary: 'Add a comment (supports @<userId> mentions in bodyMarkdown)' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CommentDto> {
    return this.commandBus.execute(new CreateCommentCommand(user.id, workspaceId, dto));
  }

  @Patch(':commentId')
  @ApiOperation({ summary: 'Edit your own comment' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CommentDto> {
    return this.commandBus.execute(new UpdateCommentCommand(user.id, workspaceId, commentId, dto));
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comment (author, or Manager+)' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteCommentCommand(user.id, workspaceId, commentId));
  }
}

@ApiTags('collaboration')
@ApiBearerAuth()
@Controller('collaboration/mentions')
export class MentionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List @mentions of me across every workspace' })
  list(@Query() query: ListMentionsQueryParamsDto, @CurrentUser() user: RequestUser): Promise<MentionDto[]> {
    return this.queryBus.execute(new ListMentionsQuery(user.id, query));
  }

  @Patch(':mentionId/read')
  @ApiOperation({ summary: 'Mark a mention as read' })
  async markRead(@Param('mentionId') mentionId: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.commandBus.execute(new MarkMentionReadCommand(user.id, mentionId));
  }
}
