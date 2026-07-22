import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { ActivityFeedItemDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListActivityFeedQueryParamsDto } from '../dto/collaboration.dto.js';
import { ListActivityFeedQuery } from '../queries/activity-feed.query.js';

@ApiTags('collaboration')
@ApiBearerAuth()
@Controller('collaboration/workspaces/:workspaceId/activity')
export class ActivityFeedController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: 'Workspace activity feed (read-through over ActivityEvent)' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListActivityFeedQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ActivityFeedItemDto[]> {
    return this.queryBus.execute(new ListActivityFeedQuery(user.id, workspaceId, query));
  }
}
