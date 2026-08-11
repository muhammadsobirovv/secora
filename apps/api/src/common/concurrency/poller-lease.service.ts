import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ClusterLeaseDto } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

/// Module 10 — High Availability. Every `setInterval`-based poller
/// service in this codebase (WebhookDeliveryQueueService,
/// WorkflowRunnerService, ScheduledJobRunnerService,
/// ReportScheduleRunnerService, DataRetentionEnforcerService,
/// BackupPolicyRunnerService, ComplianceExportProcessorService) ticks
/// independently on every replica of the API process. With a single
/// replica that's harmless; with N replicas (the normal production
/// topology — see docs/adr/0010's Kubernetes deployment,
/// `replicas: 3`), every one of them would fire its tick at
/// (approximately) the same moment, each attempting the same batch of
/// work — duplicate webhook deliveries, duplicate workflow-run
/// resumptions, duplicate scheduled-job triggers. This service turns
/// each poller's `tick()` into "only the replica that currently holds
/// the named lease actually runs the body; the rest no-op and try
/// again next interval."
///
/// Implementation: a single row per lease name in `poller_leases`,
/// claimed via a conditional `UPDATE ... WHERE id = ? AND (expiresAt <
/// now() OR holderId = ?)`. Postgres serializes concurrent UPDATE
/// statements against the same row (the second writer blocks until the
/// first's statement — and, inside an implicit single-statement
/// transaction, its commit — completes, then re-evaluates the WHERE
/// clause against the now-updated row), which is what actually
/// prevents two replicas from both believing they won the lease; this
/// is standard Postgres MVCC row-locking behavior, not an
/// application-level assumption. `updateMany`'s returned `count` tells
/// the caller whether it won.
///
/// Deliberately NOT `pg_advisory_lock`/`pg_try_advisory_xact_lock`:
/// advisory locks are either connection-scoped (requiring the entire
/// critical section to run on one pinned Postgres connection — awkward
/// with Prisma's pooled driver adapter) or transaction-scoped (requiring
/// the entire critical section, including any outbound HTTP/AI calls a
/// tick's body makes, to run inside one open Postgres transaction —
/// undesirable for anything that isn't guaranteed to finish in
/// milliseconds). A plain row with an expiry avoids both problems: the
/// lease claim is one fast statement, and the guarded work runs
/// entirely outside any transaction.
///
/// Module 14 note: despite the class name, `withLease` is already a
/// general-purpose distributed lock / leader-election primitive, not
/// something poller-specific — any code that needs "only one replica
/// does X at a time" (not just the seven pollers listed above) can call
/// it with its own lease name. Module 14 adds `listLeases()` (cluster
/// visibility, for the Admin Console) and `onModuleDestroy` (proactive
/// release on graceful shutdown, for faster failover) on top of the
/// same Module 10 mechanism rather than introducing a second lock
/// implementation.
@Injectable()
export class PollerLeaseService implements OnModuleDestroy {
  private readonly logger = new Logger(PollerLeaseService.name);
  /// One random identity per process (not per instance of this
  /// injectable — Nest's default provider scope is a singleton, so this
  /// runs exactly once per process startup), used as `holderId` so a
  /// renewal by the same replica is distinguishable from a takeover by
  /// a different one.
  private readonly instanceId = randomUUID();
  /// Every lease name this instance has actually acquired at least
  /// once, so `onModuleDestroy` only issues release UPDATEs for leases
  /// this replica might plausibly still be holding, rather than one
  /// query per lease name that ever exists platform-wide.
  private readonly acquiredLeaseNames = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  /// Module 14 — Cluster Overview / Admin Console: this replica's
  /// identity, so an operator looking at `ClusterOverviewDto.leases`
  /// can tell which entries this specific API instance currently owns
  /// (`holderId === getInstanceId()`) without cross-referencing pod
  /// names or IPs.
  getInstanceId(): string {
    return this.instanceId;
  }

  /// Module 14 — High Availability / leader election visibility.
  /// Returns every named lease's current state, regardless of which
  /// replica holds it — the leader-election primitive Module 10's
  /// pollers already use, made queryable rather than only usable via
  /// `withLease`. Feeds `ClusterOverviewDto.leases` in the Admin
  /// Console's Cluster Overview page (Module 14's Admin Console task).
  async listLeases(): Promise<ClusterLeaseDto[]> {
    const now = Date.now();
    const leases = await this.prisma.pollerLease.findMany({ orderBy: { id: 'asc' } });
    return leases.map((lease) => ({
      name: lease.id,
      holderId: lease.holderId,
      acquiredAt: lease.acquiredAt.toISOString(),
      expiresAt: lease.expiresAt.toISOString(),
      expired: lease.expiresAt.getTime() < now,
    }));
  }

  /// Module 14 — Failover / Automatic Recovery. On a graceful shutdown
  /// (SIGTERM via `main.ts`'s `app.enableShutdownHooks()` — the normal
  /// path for a Kubernetes rolling update, `docker compose restart`, or
  /// `systemctl restart`), proactively release every lease this
  /// instance holds instead of leaving the next poller tick on another
  /// replica to wait out the full TTL before taking over. This turns a
  /// planned failover (the common case — deploys, scale-downs) from
  /// "up to `ttlMs` of no replica running that poller" into
  /// "effectively instant." An unplanned crash (SIGKILL, OOM, node
  /// failure) still falls back to the TTL-based expiry this service
  /// already implements — there's no hook that can run after a process
  /// is killed outright, which is exactly why every lease has a TTL in
  /// the first place rather than relying on explicit release alone.
  async onModuleDestroy(): Promise<void> {
    if (this.acquiredLeaseNames.size === 0) return;
    const now = new Date();
    await this.prisma.pollerLease.updateMany({
      where: { id: { in: [...this.acquiredLeaseNames] }, holderId: this.instanceId },
      data: { expiresAt: now },
    });
    this.logger.log(`Released ${this.acquiredLeaseNames.size} lease(s) held by this instance on shutdown.`);
  }

  /// Runs `fn()` only if this replica currently holds (or just
  /// acquired) the named lease; otherwise resolves to `undefined`
  /// without calling `fn()`. `ttlMs` should be somewhat larger than the
  /// poller's own tick interval — see each call site's comment for the
  /// margin chosen — so a replica that's still legitimately mid-tick
  /// when its lease's nominal expiry passes isn't immediately preempted
  /// by another replica racing in on the very next interval tick.
  async withLease<T>(leaseName: string, ttlMs: number, fn: () => Promise<T>): Promise<T | undefined> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    // Ensures the row exists before the conditional UPDATE below has
    // anything to match against. Racing creates from multiple replicas
    // on first-ever tick are benign — `skipDuplicates` makes exactly one
    // of them win the INSERT, and the UPDATE below is what actually
    // decides the lease winner regardless of which replica's INSERT
    // landed.
    await this.prisma.pollerLease.createMany({
      data: [{ id: leaseName, holderId: this.instanceId, acquiredAt: now, expiresAt }],
      skipDuplicates: true,
    });

    const { count } = await this.prisma.pollerLease.updateMany({
      where: {
        id: leaseName,
        OR: [{ expiresAt: { lt: now } }, { holderId: this.instanceId }],
      },
      data: { holderId: this.instanceId, acquiredAt: now, expiresAt },
    });

    if (count === 0) {
      this.logger.debug(`Lease "${leaseName}" held by another replica — skipping this tick.`);
      return undefined;
    }
    this.acquiredLeaseNames.add(leaseName);

    try {
      return await fn();
    } finally {
      // Best-effort early release: if this tick finished well within its
      // TTL, releasing immediately (rather than waiting out the full
      // TTL) lets the *next* interval's tick — on this replica or any
      // other — acquire the lease right away instead of idling.
      // Restricted to `holderId: this.instanceId` so a slow tick that
      // outlived its TTL and was already reclaimed by another replica
      // doesn't clobber that replica's now-active lease.
      await this.prisma.pollerLease.updateMany({
        where: { id: leaseName, holderId: this.instanceId },
        data: { expiresAt: now },
      });
    }
  }
}
