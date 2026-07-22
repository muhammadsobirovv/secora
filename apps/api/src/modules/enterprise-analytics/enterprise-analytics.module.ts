import { Module } from '@nestjs/common';
import { GetEnterpriseAnalyticsDashboardHandler } from './queries/enterprise-analytics.query.js';
import { EnterpriseAnalyticsController } from './controllers/enterprise-analytics.controller.js';

/// Module 10 — Enterprise Analytics: a live dashboard query, not a new
/// domain of its own — genuinely integrates three other Module 10
/// subsystems via real cross-module CQRS dispatch (`QueryBus.execute`,
/// not a direct Prisma shortcut): Enterprise Reporting's workspace-scope
/// resolution, the Distributed Job System's `GetQueueMetricsQuery`, and
/// the Plugin Marketplace's installation counts.
@Module({
  controllers: [EnterpriseAnalyticsController],
  providers: [GetEnterpriseAnalyticsDashboardHandler],
})
export class EnterpriseAnalyticsModule {}
