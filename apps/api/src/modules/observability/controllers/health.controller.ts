import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { HealthDiagnosticsDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Public } from '../../../common/decorators/public.decorator.js';

/// Module 10 — Observability. Standard liveness/readiness split for
/// container orchestration (Kubernetes, Docker Compose healthchecks,
/// ECS, etc.):
///  - `/observability/health` (liveness) — "is the process up and able
///    to respond at all", never touches the database. A crash-looping
///    process should fail this so the orchestrator restarts it; a
///    process that's merely waiting on a slow DB should NOT fail this
///    (that's what readiness is for) — conflating the two is the classic
///    "liveness probe restarts pods during a slow dependency" bootloop.
///  - `/observability/health/ready` (readiness) — "can this instance
///    actually serve traffic right now", verified with a real `SELECT 1`
///    against Postgres via Prisma. An instance that's up but can't reach
///    its database should be pulled out of the load balancer's rotation
///    (readiness fails) without being killed (liveness still passes).
@ApiTags('observability')
@Controller('observability/health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe — process is up' })
  liveness(): { status: 'ok'; uptimeSeconds: number; version: string; channel: string } {
    // Module 14 — Auto Update: same `npm_package_version` source
    // `ClusterOverviewService`'s `version.current` and `worker.main.ts`'s
    // boot log already use. This is the one endpoint reachable
    // unauthenticated from the browser (no DB dependency, so safe to
    // poll frequently) — `apps/web`'s stale-build banner compares this
    // against the version baked into the JS bundle at build time
    // (`NEXT_PUBLIC_APP_VERSION`) to detect "server redeployed since you
    // loaded this page." `channel` — Module 15 task #356 — is purely
    // informational (see RELEASE_CHANNEL's doc comment in env.validation.ts).
    return {
      status: 'ok',
      uptimeSeconds: process.uptime(),
      version: process.env.npm_package_version ?? 'unknown',
      channel: this.configService.get('RELEASE_CHANNEL', { infer: true }),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — database is reachable' })
  async readiness(@Res() res: Response): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      res.status(HttpStatus.OK).json({ status: 'ok', checks: { database: 'ok' } });
    } catch (error) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'unavailable',
        checks: { database: 'failed' },
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /// Module 15 — task #353 (Health & diagnostics). Deliberately `@Public()`
  /// like `liveness()` — a user who can't authenticate is exactly the
  /// person who most needs a working self-test. Combines a real database
  /// round-trip (with its own latency, distinct from readiness's plain
  /// ok/failed) with process metadata into one response, so the frontend
  /// diagnostics widget can build a complete "here's what my client sees"
  /// report from a single request instead of three separate calls. Never
  /// returns a non-2xx status — a degraded database is reported *in* the
  /// body (`status: 'degraded'`), not as an HTTP error, since the whole
  /// point of this endpoint is to always answer so the report can be
  /// generated even when something else is broken.
  @Public()
  @Get('diagnostics')
  @ApiOperation({ summary: 'Combined self-test — database latency + process metadata' })
  async diagnostics(): Promise<HealthDiagnosticsDto> {
    let databaseStatus: 'ok' | 'failed' = 'ok';
    let databaseLatencyMs: number | null = null;
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseLatencyMs = Date.now() - dbStart;
    } catch {
      databaseStatus = 'failed';
    }

    return {
      status: databaseStatus === 'ok' ? 'ok' : 'degraded',
      serverTime: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      version: process.env.npm_package_version ?? 'unknown',
      nodeEnv: process.env.NODE_ENV ?? 'unknown',
      checks: { database: { status: databaseStatus, latencyMs: databaseLatencyMs } },
    };
  }
}
