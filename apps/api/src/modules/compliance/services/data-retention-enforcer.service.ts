import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { AutoEnforceableRetentionResourceType } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { listOrganizationWorkspaceIds } from '../../enterprise-reporting/organization-workspace-scope.util.js';
import { PollerLeaseService } from '../../../common/concurrency/poller-lease.service.js';

const TICK_INTERVAL_MS = 60 * 60_000; // hourly — retention windows are measured in days, an hourly cadence is more than fine-grained enough and cheaper than the 60s pollers elsewhere.
const LEASE_NAME = 'data-retention-enforcer';
const LEASE_TTL_MS = 70 * 60_000; // 70 minutes — comfortably longer than the hourly tick interval; see PollerLeaseService's doc comment.

/// Enforces `DataRetentionPolicy` rows with `autoDelete: true` by
/// actually deleting rows older than `retentionDays` — the same
/// hand-rolled `setInterval` poller pattern used throughout Module 10
/// (see ScheduledJobRunnerService's doc comment for why), just on a
/// longer (hourly) cadence appropriate for a day-granularity setting.
///
/// Only `API_REQUEST_LOG` and `WEBHOOK_DELIVERY` are actually wired to
/// real deletion today (see AUTO_ENFORCEABLE_RETENTION_RESOURCE_TYPES's
/// doc comment in packages/shared/src/compliance.ts for why) — both are
/// operational/log tables with a clear, safe deletion boundary
/// (`createdAt` cutoff), unlike e.g. AiMessage or BugBountyFinding rows,
/// which are user content an automated deletion policy shouldn't touch
/// without a much more deliberate, explicitly-scoped design. A policy
/// for any other `resourceType` is stored and returned by the API (so an
/// operator can document their retention posture even before automatic
/// enforcement covers it) but this service logs and skips it rather than
/// silently doing nothing forever unnoticed.
@Injectable()
export class DataRetentionEnforcerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataRetentionEnforcerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: PollerLeaseService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  /// Module 10 — High Availability: gated by PollerLeaseService so only
  /// one replica enforces retention deletions per tick — important here
  /// specifically because the work is destructive (deleteMany), not
  /// just wasted duplicate effort.
  async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, () => this.runTick());
  }

  private async runTick(): Promise<void> {
    const policies = await this.prisma.dataRetentionPolicy.findMany({ where: { autoDelete: true } });
    for (const policy of policies) {
      try {
        await this.enforce(policy.organizationId, policy.resourceType, policy.retentionDays);
      } catch (error) {
        this.logger.error(
          `Failed to enforce retention policy ${policy.id} (${policy.resourceType})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async enforce(organizationId: string, resourceType: string, retentionDays: number): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000);

    switch (resourceType as AutoEnforceableRetentionResourceType) {
      case 'API_REQUEST_LOG': {
        const result = await this.prisma.apiRequestLog.deleteMany({
          where: { organizationId, createdAt: { lt: cutoff } },
        });
        if (result.count > 0) {
          this.logger.log(`Retention: deleted ${result.count} ApiRequestLog row(s) for org ${organizationId}.`);
        }
        return;
      }
      case 'WEBHOOK_DELIVERY': {
        const workspaceIds = await listOrganizationWorkspaceIds(this.prisma, organizationId);
        if (workspaceIds.length === 0) return;
        const result = await this.prisma.webhookDelivery.deleteMany({
          where: {
            createdAt: { lt: cutoff },
            webhookToken: { workspaceId: { in: workspaceIds } },
          },
        });
        if (result.count > 0) {
          this.logger.log(`Retention: deleted ${result.count} WebhookDelivery row(s) for org ${organizationId}.`);
        }
        return;
      }
      default:
        this.logger.debug(
          `Retention policy for resourceType "${resourceType}" (org ${organizationId}) has no automatic enforcement wired yet — skipping.`,
        );
    }
  }
}
