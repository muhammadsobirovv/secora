import { Module } from '@nestjs/common';
import { ReportContentBuilderService } from './report-content-builder.service.js';
import { ReportScheduleRunnerService } from './services/report-schedule-runner.service.js';
import {
  CreateReportScheduleHandler,
  DeleteReportScheduleHandler,
  GenerateEnterpriseReportHandler,
  UpdateReportScheduleHandler,
} from './commands/enterprise-reports.commands.js';
import { GetEnterpriseReportHandler, ListEnterpriseReportsHandler, ListReportSchedulesHandler } from './queries/enterprise-reports.query.js';
import { EnterpriseReportingController } from './controllers/enterprise-reporting.controller.js';

const COMMAND_HANDLERS = [
  GenerateEnterpriseReportHandler,
  CreateReportScheduleHandler,
  UpdateReportScheduleHandler,
  DeleteReportScheduleHandler,
];

const QUERY_HANDLERS = [ListEnterpriseReportsHandler, GetEnterpriseReportHandler, ListReportSchedulesHandler];

/// Module 10 — Enterprise Reporting: organization/workspace-wide rollup
/// reports computed from live Prisma aggregates
/// (`ReportContentBuilderService`, real numbers, not mock data), on
/// demand or via `ReportSchedule` + `ReportScheduleRunnerService`'s
/// minute-tick poller (same pattern as Module 9's
/// `ScheduledJobRunnerService`). Distinct from Module 6/9's per-finding
/// `BugReport`/report-exporter — this is a tenant-wide rollup, not a
/// single-finding writeup.
@Module({
  controllers: [EnterpriseReportingController],
  providers: [ReportContentBuilderService, ReportScheduleRunnerService, ...COMMAND_HANDLERS, ...QUERY_HANDLERS],
  exports: [ReportContentBuilderService],
})
export class EnterpriseReportingModule {}
