import { Module } from '@nestjs/common';
import {
  CreateScheduledJobHandler,
  DeleteScheduledJobHandler,
  RunScheduledJobNowHandler,
  UpdateScheduledJobHandler,
} from './commands/scheduled-jobs.commands.js';
import { ListScheduledJobRunsHandler, ListScheduledJobsHandler } from './queries/scheduled-jobs.query.js';
import { ScheduledJobRunnerService } from './services/scheduled-job-runner.service.js';
import { ScheduledJobsController } from './controllers/scheduled-jobs.controller.js';

/// Module 9's Automation surface — scheduled jobs (Daily Recon, Weekly
/// Nuclei, Monthly Asset Discovery, Automatic Scope Refresh, Automatic
/// Screenshot Updates, Automatic Report Backup). See
/// `ScheduledJobRunnerService`'s doc comment for what "runs" actually
/// means server-side today vs. what's flagged as follow-up integration
/// work with Modules 3/4/7's real execution engines.
@Module({
  controllers: [ScheduledJobsController],
  providers: [
    CreateScheduledJobHandler,
    UpdateScheduledJobHandler,
    DeleteScheduledJobHandler,
    RunScheduledJobNowHandler,
    ListScheduledJobsHandler,
    ListScheduledJobRunsHandler,
    ScheduledJobRunnerService,
  ],
})
export class AutomationModule {}
