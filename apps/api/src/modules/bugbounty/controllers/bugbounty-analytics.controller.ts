import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { BugBountyAnalyticsDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AnalyticsQueryParamsDto } from '../dto/analytics.dto.js';
import { GetBugBountyAnalyticsQuery } from '../queries/get-bugbounty-analytics.query.js';

/// `/bugbounty/analytics` per ANALYTICS_ENDPOINTS in @pentesthub/shared —
/// a filterable rollup (severity distribution, top vuln types/targets,
/// recon coverage, response time, activity timeline) distinct from the
/// unfiltered `/bugbounty/statistics` view (Module 6, on
/// BugBountyDashboardController).
@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/analytics')
export class BugBountyAnalyticsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary:
      'Bug bounty analytics: severity distribution, top vuln types/targets, recon coverage, response time, activity timeline',
  })
  getAnalytics(
    @Query() query: AnalyticsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyAnalyticsDto> {
    return this.queryBus.execute(new GetBugBountyAnalyticsQuery(user.id, query));
  }
}
