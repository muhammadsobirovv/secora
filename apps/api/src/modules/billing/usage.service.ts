import { Injectable } from '@nestjs/common';
import type { RecordUsageRequestDto, UsageCounterDto, UsageResourceType } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function endOfUtcDay(start: Date): Date {
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}
function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function endOfUtcMonth(start: Date): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}
// A fixed origin far enough in the past that a single TOTAL-period row
// per scope/resource never needs a second bucket — `periodEnd` is
// likewise a fixed far-future sentinel, not "now + N."
const TOTAL_PERIOD_START = new Date('2020-01-01T00:00:00.000Z');
const TOTAL_PERIOD_END = new Date('2999-01-01T00:00:00.000Z');

/// Module 15 — Usage metering (task #329). `record()` is the one call
/// site every meterable action in this platform is expected to reach —
/// AI chat completions, scan/recon job completion, report generation,
/// workflow runs, MCP tool calls, plugin executions, etc. Never charges
/// anything itself (that's `BillingService`/`Subscription` — entirely
/// separate); this only accumulates counters `QuotaEnforcer` and the
/// billing UI's usage bars read from. Self-hosted (`PlanTier.FREE`)
/// usage is metered identically to paid usage — metering and billing are
/// independent, per the standing "never charge for self-hosted usage"
/// rule (billing simply never acts on FREE-tier counters).
@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  /// Upserts three rows per call — DAILY/MONTHLY/TOTAL — so a
  /// `QuotaPolicy` at any `periodType` always has a matching counter to
  /// compare against without a second query branch.
  async record(input: RecordUsageRequestDto): Promise<void> {
    const now = new Date();
    const dayStart = startOfUtcDay(now);
    const monthStart = startOfUtcMonth(now);
    // Empty string, not null — see UsageCounter's doc comment in
    // schema.prisma for why (Postgres NULL-distinctness would otherwise
    // break this upsert's ON CONFLICT match).
    const scope = {
      organizationId: input.organizationId ?? '',
      workspaceId: input.workspaceId ?? '',
      userId: input.userId ?? '',
    };

    const periods: { periodType: 'DAILY' | 'MONTHLY' | 'TOTAL'; periodStart: Date; periodEnd: Date }[] = [
      { periodType: 'DAILY', periodStart: dayStart, periodEnd: endOfUtcDay(dayStart) },
      { periodType: 'MONTHLY', periodStart: monthStart, periodEnd: endOfUtcMonth(monthStart) },
      { periodType: 'TOTAL', periodStart: TOTAL_PERIOD_START, periodEnd: TOTAL_PERIOD_END },
    ];

    await Promise.all(
      periods.map((period) =>
        this.prisma.usageCounter.upsert({
          where: {
            organizationId_workspaceId_userId_resourceType_periodType_periodStart: {
              organizationId: scope.organizationId,
              workspaceId: scope.workspaceId,
              userId: scope.userId,
              resourceType: input.resourceType,
              periodType: period.periodType,
              periodStart: period.periodStart,
            },
          },
          create: {
            ...scope,
            resourceType: input.resourceType,
            periodType: period.periodType,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            quantity: input.quantity,
            unit: input.unit,
          },
          update: { quantity: { increment: input.quantity } },
        }),
      ),
    );
  }

  async getCounter(
    scope: { organizationId?: string | null; workspaceId?: string | null; userId?: string | null },
    resourceType: UsageResourceType,
    periodType: 'DAILY' | 'MONTHLY' | 'TOTAL',
  ): Promise<UsageCounterDto | null> {
    const now = new Date();
    const periodStart =
      periodType === 'DAILY' ? startOfUtcDay(now) : periodType === 'MONTHLY' ? startOfUtcMonth(now) : TOTAL_PERIOD_START;
    const counter = await this.prisma.usageCounter.findUnique({
      where: {
        organizationId_workspaceId_userId_resourceType_periodType_periodStart: {
          organizationId: scope.organizationId ?? '',
          workspaceId: scope.workspaceId ?? '',
          userId: scope.userId ?? '',
          resourceType,
          periodType,
          periodStart,
        },
      },
    });
    if (!counter) return null;
    return {
      resourceType: counter.resourceType,
      periodType: counter.periodType,
      periodStart: counter.periodStart.toISOString(),
      periodEnd: counter.periodEnd.toISOString(),
      quantity: counter.quantity,
      unit: counter.unit,
    };
  }

  async listForOrganization(organizationId: string): Promise<UsageCounterDto[]> {
    const now = new Date();
    const dayStart = startOfUtcDay(now);
    const monthStart = startOfUtcMonth(now);
    const counters = await this.prisma.usageCounter.findMany({
      where: {
        organizationId,
        workspaceId: '',
        userId: '',
        OR: [
          { periodType: 'DAILY', periodStart: dayStart },
          { periodType: 'MONTHLY', periodStart: monthStart },
          { periodType: 'TOTAL', periodStart: TOTAL_PERIOD_START },
        ],
      },
    });
    return counters.map((counter) => ({
      resourceType: counter.resourceType,
      periodType: counter.periodType,
      periodStart: counter.periodStart.toISOString(),
      periodEnd: counter.periodEnd.toISOString(),
      quantity: counter.quantity,
      unit: counter.unit,
    }));
  }
}
