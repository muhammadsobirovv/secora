import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClusterOverviewDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PollerLeaseService } from '../../common/concurrency/poller-lease.service.js';
import { CACHE_SERVICE, QUEUE_SERVICE, STORAGE_SERVICE } from '../../common/providers/tokens.js';
import type { CacheService } from '../../common/providers/cache/cache-service.interface.js';
import type { QueueDepthEntry, QueueService } from '../../common/providers/queue/queue-service.interface.js';
import type { StorageService } from '../../common/providers/storage/storage-service.interface.js';
import { EditionService } from './edition.service.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/// Module 14 — Admin Console infrastructure dashboard. One aggregation
/// point over every provider abstraction and subsystem Module 14
/// introduced (cluster leases, distributed workers, queue, cache,
/// storage, database, backups, plugins, licensing, health) so the Admin
/// Console's overview page is a single `GET` rather than a dozen
/// round-trips. Every sub-section here already has its own dedicated,
/// more detailed endpoint elsewhere in the API (backup runs:
/// `BackupsController`; edition/license detail:
/// `EditionController`; per-organization queue/worker metrics:
/// `distributed-jobs` module) — this service exists purely to summarize
/// across all of them for one screen, not to replace any of them.
///
/// Deliberately deployment-wide, not organization-scoped: `WorkerNode`/
/// `DistributedJob`/`BackupRun`/`PluginInstallation` rows can belong to
/// any organization (or none, for Community Edition), and an operator
/// looking at cluster health cares about the whole deployment, not one
/// tenant's slice of it.
///
/// Authorization note: this endpoint sits behind the standard
/// JWT-authenticated guard chain (like `EditionController`'s `GET
/// /infrastructure/edition`) but no additional role check — this
/// codebase's RBAC (`RolesGuard`, `enterpriseRoleAtLeast`) is scoped to
/// membership *within* a specific organization, and there's no
/// deployment-wide "platform admin" flag on `User` to check against
/// instead. A production deployment that wants to restrict who can see
/// aggregate infrastructure detail (worker counts, queue depth, DB pool
/// size) should do so at the network layer — `IP_ALLOWLIST` scoped to an
/// internal admin network, or a reverse-proxy path restriction in front
/// of `/infrastructure/admin/*` — rather than relying on an
/// application-level role this codebase doesn't yet model. Introducing a
/// real deployment-wide admin role is a larger change than this task's
/// scope; disclosed here rather than silently left unstated.
@Injectable()
export class ClusterOverviewService {
  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
    private readonly editionService: EditionService,
    private readonly pollerLeaseService: PollerLeaseService,
    @Inject(QUEUE_SERVICE) private readonly queueService: QueueService,
    @Inject(CACHE_SERVICE) private readonly cacheService: CacheService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {}

  async getOverview(): Promise<ClusterOverviewDto> {
    const failedSince = new Date(Date.now() - ONE_DAY_MS);

    const [
      editionInfo,
      leases,
      workerStatusGroups,
      jobStatusGroups,
      failed24h,
      queueResult,
      cacheResult,
      lastBackupRun,
      policiesConfigured,
      pluginsInstalled,
      pluginsEnabled,
      migrationsApplied,
      ready,
    ] = await Promise.all([
      this.editionService.getInfo(),
      this.pollerLeaseService.listLeases(),
      this.prisma.workerNode.groupBy({ by: ['status'], _count: true }),
      this.prisma.distributedJob.groupBy({ by: ['status'], _count: true }),
      this.prisma.distributedJob.count({ where: { status: 'FAILED', finishedAt: { gte: failedSince } } }),
      this.queueService
        .stats()
        .then((queues) => ({ queues, connected: true }))
        .catch((): { queues: QueueDepthEntry[]; connected: boolean } => ({ queues: [], connected: false })),
      this.cacheService
        .stats()
        .then((stats) => ({ ...stats, connected: true }))
        .catch((): { entryCount: number | null; hitRate: number | null; connected: boolean } => ({
          entryCount: null,
          hitRate: null,
          connected: false,
        })),
      this.prisma.backupRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.backupPolicy.count(),
      this.prisma.pluginInstallation.count(),
      this.prisma.pluginInstallation.count({ where: { enabled: true } }),
      this.countAppliedMigrations(),
      this.checkReady(),
    ]);

    const totalWorkers = workerStatusGroups.reduce((sum, g) => sum + g._count, 0);
    const onlineWorkers = workerStatusGroups.find((g) => g.status === 'ONLINE')?._count ?? 0;
    const unhealthyWorkers = workerStatusGroups.find((g) => g.status === 'UNHEALTHY')?._count ?? 0;
    const queuedJobs = jobStatusGroups.find((g) => g.status === 'QUEUED')?._count ?? 0;
    const runningJobs = jobStatusGroups.find((g) => g.status === 'RUNNING')?._count ?? 0;

    const storageProvider = this.configService.get('STORAGE_PROVIDER', { infer: true });
    const { totalBytes: storageTotalBytes, connected: storageConnected } = await this.probeStorage(storageProvider);

    return {
      edition: editionInfo.edition,
      instanceId: this.pollerLeaseService.getInstanceId(),
      // Mirrors observability/tracing.ts's SERVICE_VERSION fallback — no
      // dedicated update-check/rollback data yet (that lands with the
      // Auto Update task); this is just "what's currently running."
      version: { current: process.env.npm_package_version ?? '0.0.1' },
      workerNodes: { total: totalWorkers, online: onlineWorkers, unhealthy: unhealthyWorkers },
      distributedJobs: { queued: queuedJobs, running: runningJobs, failed24h },
      queue: {
        provider: this.configService.get('QUEUE_PROVIDER', { infer: true }),
        connected: queueResult.connected,
        queues: queueResult.queues,
      },
      cache: {
        provider: this.configService.get('CACHE_PROVIDER', { infer: true }),
        connected: cacheResult.connected,
        entryCount: cacheResult.entryCount,
        hitRate: cacheResult.hitRate,
      },
      storage: {
        provider: storageProvider,
        bucket: storageProvider === 's3' ? (this.configService.get('STORAGE_S3_BUCKET', { infer: true }) ?? null) : null,
        totalBytes: storageTotalBytes,
      },
      database: {
        provider: 'postgresql',
        poolMax: this.configService.get('DATABASE_POOL_MAX', { infer: true }),
        readReplicaConfigured: this.prisma.hasReadReplica(),
        migrationsApplied,
      },
      backups: {
        lastRunAt: lastBackupRun ? lastBackupRun.startedAt.toISOString() : null,
        lastRunStatus: lastBackupRun ? lastBackupRun.status : null,
        policiesConfigured,
      },
      plugins: { installed: pluginsInstalled, enabled: pluginsEnabled },
      activeLicense: editionInfo.activeLicense,
      health: { live: true, ready },
      leases,
    };
  }

  /// `SELECT 1`, same check `HealthController.readiness()` performs — not
  /// reused directly since that handler writes straight to the HTTP
  /// `Response` object rather than returning a value.
  private async checkReady(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /// Counts successfully-applied rows in Prisma's own internal migration
  /// history table. Wrapped in try/catch because that table only exists
  /// on a deployment that has actually run `prisma migrate deploy` at
  /// least once — one that used `prisma db push` instead (a documented,
  /// supported path for a fresh Community Edition install — see
  /// `apps/api/scripts/validate-migrations.mjs`) never creates it, and
  /// that's a normal, not an error, state — 0 is the correct answer, not
  /// a failure to surface.
  private async countAppliedMigrations(): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
      return Number(rows[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  /// `exists()` (cheap, single-key) as a connectivity probe for both
  /// storage bindings; `list()` (which can enumerate every object) is
  /// only used for the local-disk provider's disk-usage total, matching
  /// `StorageDashboardDto.totalBytes`'s own doc comment on why `s3`
  /// deliberately reports `null` instead of a full bucket scan.
  private async probeStorage(provider: 'local' | 's3'): Promise<{ totalBytes: number | null; connected: boolean }> {
    try {
      await this.storageService.exists('__cluster_overview_connectivity_probe__');
    } catch {
      return { totalBytes: null, connected: false };
    }
    if (provider !== 'local') {
      return { totalBytes: null, connected: true };
    }
    try {
      const objects = await this.storageService.list('');
      return { totalBytes: objects.reduce((sum, o) => sum + o.sizeBytes, 0), connected: true };
    } catch {
      return { totalBytes: null, connected: true };
    }
  }
}
