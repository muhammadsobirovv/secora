import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { STORAGE_SERVICE } from '../../../common/providers/tokens.js';
import type { StorageService } from '../../../common/providers/storage/storage-service.interface.js';
import { PollerLeaseService } from '../../../common/concurrency/poller-lease.service.js';
import { BackupService } from '../../backups/backup.service.js';

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
/// other Module 9/10 tick service). Module 14 rewrote this to delegate
/// the actual backup work to `BackupService.trigger()` (real `pg_dump`
/// for DATABASE/FULL scope, a real object-storage copy for STORAGE
/// scope, a config snapshot for CONFIGURATION scope — see that class's
/// doc comment) instead of the original Module 10 JSON-metadata-only
/// snapshot, and added the pruning pass its own doc comment had
/// disclosed as a known gap ("pruning old backup files isn't
/// implemented ... requires the StorageService interface to support
/// listing/deleting by prefix") — `StorageService.list()` (Module 14)
/// closes that gap.
@Injectable()
export class BackupPolicyRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupPolicyRunnerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly leases: PollerLeaseService,
    private readonly backupService: BackupService,
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
        await this.backupService.trigger(policy.organizationId, policy.scope, 'SCHEDULED', policy.encrypt);
        await this.prisma.backupPolicy.update({ where: { id: policy.id }, data: { lastBackupAt: new Date() } });
        await this.prune(policy.id, policy.organizationId, policy.retentionCount);
      } catch (error) {
        this.logger.error(
          `Scheduled backup failed for org ${policy.organizationId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /// Keeps the most recent `retentionCount` SUCCEEDED runs for this
  /// policy's organization and deletes the rest — both the storage
  /// object (`StorageService.delete`) and the `BackupRun` row itself, so
  /// the Admin Console's Backups page never shows a run whose archive no
  /// longer exists.
  private async prune(policyId: string, organizationId: string, retentionCount: number): Promise<void> {
    const succeededRuns = await this.prisma.backupRun.findMany({
      where: { organizationId, status: 'SUCCEEDED' },
      orderBy: { startedAt: 'desc' },
    });
    const toPrune = succeededRuns.slice(retentionCount);
    for (const run of toPrune) {
      if (run.storageKey) {
        await this.storageService.delete(run.storageKey);
      }
      await this.prisma.backupRun.delete({ where: { id: run.id } });
    }
    if (toPrune.length > 0) {
      await this.prisma.backupPolicy.update({ where: { id: policyId }, data: { lastPrunedAt: new Date() } });
      this.logger.log(`Pruned ${toPrune.length} old backup run(s) for org ${organizationId} (retention: ${retentionCount}).`);
    }
  }
}
