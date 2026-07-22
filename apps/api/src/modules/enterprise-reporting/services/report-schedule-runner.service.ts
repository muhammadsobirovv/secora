import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '../../../prisma-types.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { computeNextRunAt } from '../../automation/scheduled-job-cron.util.js';
import { ReportContentBuilderService } from '../report-content-builder.service.js';
import { PollerLeaseService } from '../../../common/concurrency/poller-lease.service.js';

const LEASE_NAME = 'report-schedule-runner';
const LEASE_TTL_MS = 90_000; // 1.5x the 60s tick interval — see PollerLeaseService's doc comment.

/// Minute-tick poller that generates due `ReportSchedule` reports — the
/// exact same hand-rolled `setInterval` + `OnModuleInit`/
/// `OnModuleDestroy` shape as Module 9's `ScheduledJobRunnerService`
/// (see its doc comment for why this avoids a new `@nestjs/schedule`
/// dependency this sandbox can't verify installs cleanly), applied to
/// `ReportSchedule` instead of `ScheduledJob`. Each due schedule gets a
/// real `EnterpriseReport` row generated via the same
/// `ReportContentBuilderService` a manual "Generate now" call uses — no
/// separate/duplicated computation path.
@Injectable()
export class ReportScheduleRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportScheduleRunnerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentBuilder: ReportContentBuilderService,
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
  /// one replica generates due reports per tick.
  async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, () => this.runTick());
  }

  private async runTick(): Promise<void> {
    const due = await this.prisma.reportSchedule.findMany({
      where: { active: true, nextRunAt: { lte: new Date() } },
      take: 50,
    });
    for (const schedule of due) {
      try {
        await this.runSchedule(schedule.id);
      } catch (error) {
        this.logger.error(`Report schedule ${schedule.id} failed`, error instanceof Error ? error.stack : String(error));
      }
    }
  }

  async runSchedule(scheduleId: string): Promise<void> {
    const schedule = await this.prisma.reportSchedule.findUniqueOrThrow({ where: { id: scheduleId } });

    const content = await this.contentBuilder.build({
      organizationId: schedule.organizationId,
      workspaceId: schedule.workspaceId,
      periodStart: null,
      periodEnd: null,
    });

    await this.prisma.enterpriseReport.create({
      data: {
        organizationId: schedule.organizationId,
        workspaceId: schedule.workspaceId,
        type: schedule.type,
        title: `Scheduled ${schedule.type} report — ${new Date().toISOString().slice(0, 10)}`,
        contentJson: content as unknown as Prisma.InputJsonValue,
        generatedByAi: false,
      },
    });

    // `recipients` delivery (email/webhook) is intentionally not
    // performed here — Module 9's NotificationsChannelsModule already
    // owns multi-channel delivery, and wiring this schedule's
    // `recipients` list into it is the concrete follow-up flagged for a
    // future pass (the report row itself, the actual deliverable, is
    // genuinely created either way).
    await this.prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: new Date(), nextRunAt: computeNextRunAt(schedule.cronExpression) },
    });
  }
}
