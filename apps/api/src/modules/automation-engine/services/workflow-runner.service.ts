import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { computeNextRunAt } from '../../automation/scheduled-job-cron.util.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { PollerLeaseService } from '../../../common/concurrency/poller-lease.service.js';

const LEASE_NAME = 'workflow-runner';
const LEASE_TTL_MS = 90_000; // 1.5x the 60s tick interval — see PollerLeaseService's doc comment.

/// Minute-tick poller — the same hand-rolled `setInterval` +
/// `OnModuleInit`/`OnModuleDestroy` shape as `ScheduledJobRunnerService`,
/// `ReportScheduleRunnerService`, and `WebhookDeliveryQueueService` (see
/// any of their doc comments for why this avoids a new `@nestjs/schedule`
/// dependency). Two independent responsibilities share one tick because
/// they're both "notice something is due, then hand off to
/// WorkflowExecutorService":
///  1. Start a fresh `WorkflowRun` for every enabled `SCHEDULE`-trigger
///     `Workflow` whose `nextRunAt` has passed (reuses
///     `computeNextRunAt` from Module 9's automation module — the exact
///     same cron parser `ScheduledJobRunnerService` uses, cross-module
///     reuse rather than a second implementation).
///  2. Resume every `WorkflowRun` paused at a `delay` step whose
///     `resumeAt` has passed.
@Injectable()
export class WorkflowRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowRunnerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: WorkflowExecutorService,
    private readonly leases: PollerLeaseService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  /// Module 10 — High Availability: gated by PollerLeaseService so only
  /// one replica starts/resumes workflow runs per tick.
  async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, async () => {
      await this.startDueScheduledWorkflows();
      await this.resumeDelayedRuns();
    });
  }

  private async startDueScheduledWorkflows(): Promise<void> {
    const due = await this.prisma.workflow.findMany({
      where: { enabled: true, triggerType: 'SCHEDULE', nextRunAt: { lte: new Date() } },
      take: 50,
    });
    for (const workflow of due) {
      try {
        const run = await this.prisma.workflowRun.create({
          data: { workflowId: workflow.id, status: 'PENDING', triggeredBy: null },
        });
        await this.prisma.workflow.update({
          where: { id: workflow.id },
          data: { nextRunAt: workflow.cronExpression ? computeNextRunAt(workflow.cronExpression) : null },
        });
        await this.executor.start(run.id);
      } catch (error) {
        this.logger.error(`Scheduled workflow ${workflow.id} failed to start`, error instanceof Error ? error.stack : String(error));
      }
    }
  }

  private async resumeDelayedRuns(): Promise<void> {
    const due = await this.prisma.workflowRun.findMany({
      where: { status: 'RUNNING', pausedAtStepKey: { not: null }, resumeAt: { lte: new Date() } },
      take: 50,
    });
    for (const run of due) {
      try {
        await this.executor.resume(run.id);
      } catch (error) {
        this.logger.error(`Failed to resume workflow run ${run.id}`, error instanceof Error ? error.stack : String(error));
      }
    }
  }
}
