import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { ActivityEventDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListActivityQueryParamsDto } from '../dto/list-activity-query.dto.js';
import { ListActivityQuery } from '../queries/list-activity.query.js';

@ApiTags('activity')
@ApiBearerAuth()
@Controller('activity')
export class ActivityController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: 'List the workspace activity timeline' })
  list(
    @Query() query: ListActivityQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ActivityEventDto[]> {
    return this.queryBus.execute(
      new ListActivityQuery(
        user.id,
        query.projectId,
        query.cursor,
        query.limit,
      ),
    );
  }
}
