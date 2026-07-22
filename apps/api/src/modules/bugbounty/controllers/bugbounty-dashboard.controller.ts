import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type {
  BugBountyDashboardDto,
  BugBountyStatisticsDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  GetBugBountyDashboardQuery,
  GetBugBountyStatisticsQuery,
} from '../queries/bugbounty-dashboard.queries.js';

@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller()
export class BugBountyDashboardController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('bugbounty/dashboard')
  @ApiOperation({ summary: 'Bug Bounty Workspace dashboard summary' })
  summary(@CurrentUser() user: RequestUser): Promise<BugBountyDashboardDto> {
    return this.queryBus.execute(new GetBugBountyDashboardQuery(user.id));
  }

  @Get('bugbounty/statistics')
  @ApiOperation({
    summary:
      'Bug Bounty Workspace statistics (success/acceptance rates, earnings, etc.)',
  })
  statistics(
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyStatisticsDto> {
    return this.queryBus.execute(new GetBugBountyStatisticsQuery(user.id));
  }
}
