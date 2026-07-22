import { Controller, ForbiddenException, Get, Header, Param, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MetricsRegistryService } from '../metrics-registry.service.js';

/// Module 10 — Observability. `@Public()` because Prometheus scrapers
/// don't do OAuth/JWT — the standard way to protect a metrics endpoint
/// in production is a network-level control (scrape target on a
/// private/internal network, or a reverse-proxy IP allowlist), not
/// application auth. `OBSERVABILITY_METRICS_TOKEN` (checked directly via
/// `process.env` rather than `ConfigService`/`env.validation.ts` —
/// deliberately not added to the required schema there, since requiring
/// it would break every existing deployment's env file) provides an
/// optional shared-secret check for the process-wide endpoint (open by
/// default — correct for local/sandboxed environments) and a mandatory
/// one for the per-organization endpoint, which has no other
/// authorization at all — see each route's doc comment.
/// `@ApiExcludeController()` keeps two high-volume, non-business
/// endpoints out of the public Swagger UI.
@ApiExcludeController()
@Controller()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  private checkMetricsToken(req: Request, required: boolean): void {
    const expected = process.env.OBSERVABILITY_METRICS_TOKEN;
    if (!expected) {
      if (required) {
        // The per-organization route exposes tenant-scoped operational
        // data with no user-identity check at all (see
        // getQueueMetricsPrometheus's doc comment for why) — unlike the
        // process-wide endpoint above, it refuses to serve traffic at
        // all until an operator explicitly configures a token, rather
        // than defaulting to open.
        throw new ForbiddenException(
          'OBSERVABILITY_METRICS_TOKEN must be configured to use the per-organization Prometheus endpoint.',
        );
      }
      return; // Global endpoint: no token configured — open (dev-friendly default).
    }
    const provided = req.header('X-Metrics-Token') ?? req.header('Authorization')?.replace(/^Bearer\s+/i, '');
    if (provided !== expected) {
      throw new ForbiddenException('Invalid or missing metrics token.');
    }
  }

  @Public()
  @Get('observability/metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getProcessMetrics(@Req() req: Request): string {
    this.checkMetricsToken(req, false);
    return this.metrics.renderPrometheusText();
  }

  /// The route forward-referenced by GetQueueMetricsQuery's doc comment
  /// (distributed-jobs.query.ts) since before this controller existed —
  /// this is what fulfills that reference. Deliberately does NOT reuse
  /// GetQueueMetricsQuery/GetQueueMetricsHandler (which authorizes via
  /// the *requesting user's* organization membership) — a Prometheus
  /// scraper has no user identity, and accepting an arbitrary
  /// caller-supplied userId on a @Public() route to satisfy that check
  /// would let an unauthenticated caller probe which userIds belong to
  /// which organizations (a confused-deputy/enumeration risk). Instead
  /// this computes the same aggregates directly (identical query shape
  /// to GetQueueMetricsHandler, just without the membership check) and
  /// mandatorily requires OBSERVABILITY_METRICS_TOKEN to be configured
  /// (see checkMetricsToken) rather than defaulting to open, since this
  /// route has no other authorization at all.
  @Public()
  @Get('enterprise/organizations/:organizationId/distributed-jobs/metrics/prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getQueueMetricsPrometheus(@Param('organizationId') organizationId: string, @Req() req: Request): Promise<string> {
    this.checkMetricsToken(req, true);

    const [statusGroups, priorityGroups, workers] = await Promise.all([
      this.prisma.distributedJob.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
      this.prisma.distributedJob.groupBy({ by: ['priority'], where: { organizationId, status: 'QUEUED' }, _count: true }),
      this.prisma.workerNode.findMany({ where: { organizationId } }),
    ]);
    const metrics = {
      byStatus: Object.fromEntries(statusGroups.map((g) => [g.status, g._count])) as Record<string, number>,
      byPriority: Object.fromEntries(priorityGroups.map((g) => [g.priority, g._count])) as Record<string, number>,
      onlineWorkers: workers.filter((w) => w.status === 'ONLINE').length,
      totalCapacity: workers.reduce((sum, w) => sum + w.maxConcurrency, 0),
      currentLoad: workers.reduce((sum, w) => sum + w.currentLoad, 0),
    };

    const lines = [
      '# HELP pentesthub_distributed_jobs_online_workers Online worker count.',
      '# TYPE pentesthub_distributed_jobs_online_workers gauge',
      `pentesthub_distributed_jobs_online_workers{organizationId="${organizationId}"} ${metrics.onlineWorkers}`,
      '# HELP pentesthub_distributed_jobs_total_capacity Total worker capacity (sum of maxConcurrency).',
      '# TYPE pentesthub_distributed_jobs_total_capacity gauge',
      `pentesthub_distributed_jobs_total_capacity{organizationId="${organizationId}"} ${metrics.totalCapacity}`,
      '# HELP pentesthub_distributed_jobs_current_load Jobs currently RUNNING.',
      '# TYPE pentesthub_distributed_jobs_current_load gauge',
      `pentesthub_distributed_jobs_current_load{organizationId="${organizationId}"} ${metrics.currentLoad}`,
    ];
    for (const [status, count] of Object.entries(metrics.byStatus)) {
      lines.push(`pentesthub_distributed_jobs_by_status{organizationId="${organizationId}",status="${status}"} ${count}`);
    }
    for (const [priority, count] of Object.entries(metrics.byPriority)) {
      lines.push(`pentesthub_distributed_jobs_by_priority{organizationId="${organizationId}",priority="${priority}"} ${count}`);
    }
    return lines.join('\n') + '\n';
  }
}
