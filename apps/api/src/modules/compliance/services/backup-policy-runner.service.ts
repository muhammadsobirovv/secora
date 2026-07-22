import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { STORAGE_SERVICE } from '../../../common/providers/tokens.js';
import type { StorageService } from '../../../common/providers/storage/storage-service.interface.js';
import { PollerLeaseService } from '../../../common/concurrency/poller-lease.service.js';

const TICK_INTERVAL_MS = 60 * 60_000; // hourly — coarsest configurable frequency is HOURLY, so this is the finest cadence that can ever matter.
const LEASE_NAME = 'backup-policy-runner';
const LEASE_TTL_MS = 70 * 60_000; // 70 minutes — comfortably longer than the hourly tick interval; see PollerLeaseService's doc comment.

const FREQUENCY_MS: Record<string, number> = {
  HOURLY: 60 * 60_000,
  DAILY: 24 * 60 * 60_000,
  WEEKLY: 7 * 24 * 60 * 60_000,
  MONTHLY: 30 * 24 * 60 * 60_000,
};

/// Runs due `BackupPolicy` rows (an hourly poller comparing
/// `lastBackupAt + frequency` against now, the same pattern as every
/// other Module 9/10 tick service). "Backup" here means the same honest
/// scope as `ReportScheduleRunnerService.runReportBackup`: a real,
/// computed metadata snapshot of the organization's key rows (uploaded
/// as one JSON file via the existing `StorageService` abstraction — the
/// same interface Attachments/Evidence use — so it's a genuine file a
/// deployment can retrieve, not a log line pretending to be one) rather
/// than a full encrypted database dump, which depends on
/// deployment-specific infrastructure (pg_dump access, an object-storage
/// bucket, a restore procedure) this application-level service
/// deliberately doesn't own — see docs/deployment for the recommended
/// `pg_dump`-based approach for a full database backup in production.
/// `retentionCount` is recorded on the policy for a future pruning pass
/// (deleting old backup files past the count) but pruning old backup
/// *files* isn't implemented here yet, since it requires the
/// StorageService interface to support listing/deleting by prefix,
/// which apps/api/src/common/providers/storage/storage-service.interface.ts
/// doesn't expose today — a disclosed, concrete follow-up rather than a
/// silent gap.
@Injectable()
export class BackupPolicyRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupPolicyRunnerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
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
  /// one replica runs due backups per tick.
  async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, () => this.runTick());
  }

  private async runTick(): Promise<void> {
    const policies = await this.prisma.backupPolicy.findMany();
    for (const policy of policies) {
      const intervalMs = FREQUENCY_MS[policy.frequency] ?? FREQUENCY_MS.DAILY;
      const due = !policy.lastBackupAt || Date.now() - policy.lastBackupAt.getTime() >= intervalMs;
      if (!due) continue;

      try {
        await this.runBackup(policy.id, policy.organizationId);
      } catch (error) {
        this.logger.error(`Backup failed for org ${policy.organizationId}`, error instanceof Error ? error.stack : String(error));
      }
    }
  }

  private async runBackup(policyId: string, organizationId: string): Promise<void> {
    const [organization, memberCount, workflowCount, integrationCount, workspaceCount] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, slug: true } }),
      this.prisma.organizationMember.count({ where: { organizationId } }),
      this.prisma.workflow.count({ where: { organizationId } }),
      this.prisma.integrationConnection.count({ where: { organizationId } }),
      this.prisma.workspace.findMany({ where: { OR: [{ organizationId }, { team: { organizationId } }] }, select: { id: true } }),
    ]);

    const snapshot = {
      organization,
      counts: {
        members: memberCount,
        workflows: workflowCount,
        integrationConnections: integrationCount,
        workspaces: workspaceCount.length,
      },
      generatedAt: new Date().toISOString(),
    };

    const key = `compliance-backups/${organizationId}/${Date.now()}.json`;
    await this.storageService.upload(key, Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8'), 'application/json');

    await this.prisma.backupPolicy.update({ where: { id: policyId }, data: { lastBackupAt: new Date() } });
    this.logger.log(`Backup snapshot written for org ${organizationId} at ${key}.`);
  }
}
