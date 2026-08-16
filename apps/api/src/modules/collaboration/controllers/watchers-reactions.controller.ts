import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { ReactionDto, WatcherDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  ListReactionsQueryParamsDto,
  ListWatchersQueryParamsDto,
  ToggleReactionDto,
  ToggleWatcherDto,
} from '../dto/collaboration.dto.js';
import { ToggleWatcherCommand } from '../commands/watchers.commands.js';
import { ToggleReactionCommand } from '../commands/reactions.commands.js';
import {
  GetMyWatchStateQuery,
  ListReactionsQuery,
  ListWatchersQuery,
} from '../queries/watchers-reactions.query.js';

/// Deliberately no `:workspaceId` path param, unlike Comments/
/// Assignments/TaskItems — a Watcher/Reaction row has no workspaceId
/// column of its own (see schema.prisma), so trusting a client-supplied
/// one here would be meaningless at best and a spoofing vector at worst.
/// Every handler resolves the true owning workspace from the entity
/// itself (see collaboration-entity-resolver.util.ts) before checking
/// membership.
@ApiTags('collaboration')
@ApiBearerAuth()
@Controller('collaboration/watchers')
export class WatchersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List everyone watching an entity' })
  list(@Query() query: ListWatchersQueryParamsDto, @CurrentUser() user: RequestUser): Promise<WatcherDto[]> {
    return this.queryBus.execute(new ListWatchersQuery(user.id, query.entityType, query.entityId));
  }

  @Get('me')
  @ApiOperation({ summary: 'Am I watching this entity?' })
  me(@Query() query: ListWatchersQueryParamsDto, @CurrentUser() user: RequestUser): Promise<WatcherDto | null> {
    return this.queryBus.execute(new GetMyWatchStateQuery(user.id, query.entityType, query.entityId));
  }

  @Post('toggle')
  @ApiOperation({ summary: 'Watch/unwatch an entity (toggle)' })
  toggle(@Body() dto: ToggleWatcherDto, @CurrentUser() user: RequestUser): Promise<WatcherDto | null> {
    return this.commandBus.execute(new ToggleWatcherCommand(user.id, dto));
  }
}

@ApiTags('collaboration')
@ApiBearerAuth()
@Controller('collaboration/reactions')
export class ReactionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List reactions on an entity' })
  list(@Query() query: ListReactionsQueryParamsDto, @CurrentUser() user: RequestUser): Promise<ReactionDto[]> {
    return this.queryBus.execute(new ListReactionsQuery(user.id, query.entityType, query.entityId));
  }

  @Post('toggle')
  @ApiOperation({ summary: 'Add/remove a single emoji reaction (toggle)' })
  toggle(@Body() dto: ToggleReactionDto, @CurrentUser() user: RequestUser): Promise<ReactionDto | null> {
    return this.commandBus.execute(new ToggleReactionCommand(user.id, dto));
  }
}
