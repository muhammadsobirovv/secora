import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { EnterpriseAnalyticsDashboardDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { GetEnterpriseAnalyticsDashboardQuery } from '../queries/enterprise-analytics.query.js';

@ApiTags('enterprise-analytics')
@ApiBearerAuth()
@Controller('enterprise/organizations/:organizationId/analytics')
export class EnterpriseAnalyticsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Live organization-wide analytics dashboard (findings trend, SLA, job queue health, plugin adoption)' })
  dashboard(
    @Param('organizationId') organizationId: string,
    @Query('days') days: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<EnterpriseAnalyticsDashboardDto> {
    return this.queryBus.execute(new GetEnterpriseAnalyticsDashboardQuery(user.id, organizationId, days ? Number(days) : undefined));
  }
}
