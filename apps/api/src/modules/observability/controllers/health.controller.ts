import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { HealthDiagnosticsDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { QUEUE_SERVICE, STORAGE_SERVICE } from '../../../common/providers/tokens.js';
import type { QueueService } from '../../../common/providers/queue/queue-service.interface.js';
import type { StorageService } from '../../../common/providers/storage/storage-service.interface.js';

/// Module 10 — Observability, extended by Module 18 (task #507). Standard
/// liveness/readiness/version split for container orchestration
/// (Kubernetes, Docker Compose healthchecks, ECS, etc.). Registered under
/// TWO route prefixes (`@Controller([...])`, Nest's multi-prefix support —
/// not a second controller/duplicate implementation) so both this
/// project's original paths and Module 18's exact spec-requested paths
/// resolve to the same handlers:
///   `/observability/health`       and `/health`       — liveness
///   `/observability/health/live`  and `/health/live`  — liveness (alias)
///   `/observability/health/ready` and `/health/ready` — readiness
///   `/observability/health/version` and `/health/version` — version info
///   `/observability/health/diagnostics` — combined self-test (unchanged)
///
///  - Liveness — "is the process up and able to respond at all", never
///    touches the database. A crash-looping process should fail this so
///    the orchestrator restarts it; a process that's merely waiting on a
///    slow DB should NOT fail this (that's what readiness is for) —
///    conflating the two is the classic "liveness probe restarts pods
///    during a slow dependency" bootloop.
///  - Readiness — "can this instance actually serve traffic right now".
///    Always verifies the database with a real `SELECT 1`. Additionally
///    checks the queue/storage backends, but ONLY when a deployment has
///    actually opted into a network-backed one (`QUEUE_PROVIDER=redis` /
///    `STORAGE_PROVIDER=s3`) — at that point the operator has made it
///    mandatory infra for their deployment, not an optional integration,
///    so it belongs in the same fail-closed gate as the database. The
///    Community Edition defaults (`memory`/`local`) are in-process/
///    filesystem and can't meaningfully fail independently of the process
///    itself, which liveness already covers — checking them here would
///    add latency for no real signal. This is the "optional providers
///    must not block readiness" requirement: AI providers, OAuth, threat
///    intel feeds, and any other genuinely optional integration are never
///    checked here at all, configured or not.
@ApiTags('observability')
@Controller(['observability/health', 'health'])
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(QUEUE_SERVICE) private readonly queue: QueueService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe — process is up' })
  liveness(): { status: 'ok'; uptimeSeconds: number; version: string; channel: string } {
    return this.buildLivenessBody();
  }

  /// Module 18 — task #507. Identical body to `liveness()` — the spec's
  /// exact requested path (`GET /health/live`) alongside the project's
  /// original bare `GET /health`/`GET /observability/health`, not a
  /// second implementation to keep in sync.
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process is up (alias of GET /health)' })
  live(): { status: 'ok'; uptimeSeconds: number; version: string; channel: string } {
    return this.buildLivenessBody();
  }

  private buildLivenessBody(): { status: 'ok'; uptimeSeconds: number; version: string; channel: string } {
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
  @ApiOperation({ summary: 'Readiness probe — database (and, if configured, queue/storage) is reachable' })
  async readiness(@Res() res: Response): Promise<void> {
    const checks: Record<string, 'ok' | 'failed' | 'skipped'> = {};
    let allOk = true;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'failed';
      allOk = false;
    }

    // Module 18 — task #507. Only checked when the deployment has opted
    // into the network-backed provider — see this controller's doc
    // comment for why the Community Edition in-process defaults are
    // skipped rather than checked-and-always-passing.
    if (this.configService.get('QUEUE_PROVIDER', { infer: true }) === 'redis') {
      try {
        await this.queue.stats();
        checks.queue = 'ok';
      } catch {
        checks.queue = 'failed';
        allOk = false;
      }
    } else {
      checks.queue = 'skipped';
    }

    if (this.configService.get('STORAGE_PROVIDER', { infer: true }) === 's3') {
      try {
        // Read-only reachability probe — `exists()` never throws by
        // contract (S3CompatibleStorageService catches internally and
        // returns false for a missing key), so any exception here means
        // a lower-level failure (network/credentials/endpoint), which is
        // exactly what readiness needs to detect. The key itself need not
        // exist; only reachability is being verified.
        await this.storage.exists('__pentesthub_health_check__');
        checks.storage = 'ok';
      } catch {
        checks.storage = 'failed';
        allOk = false;
      }
    } else {
      checks.storage = 'skipped';
    }

    if (allOk) {
      res.status(HttpStatus.OK).json({ status: 'ok', checks });
    } else {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ status: 'unavailable', checks });
    }
  }

  /// Module 18 — task #507. `version`/`environment` reuse the same
  /// sources `liveness()`/`diagnostics()` already read. `gitCommit`/
  /// `buildTimestamp` are genuinely optional (per the spec: "git commit
  /// if available, build timestamp if available") — this codebase's CI
  /// (`.github/workflows/release.yml`) does not currently inject
  /// `GIT_COMMIT`/`BUILD_TIMESTAMP` env vars into the running process, so
  /// both are `null` in every environment today rather than fabricated;
  /// a deployment/CI pipeline that wants them populated can set these two
  /// env vars at container build or start time — no code change needed.
  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Build/version metadata' })
  version(): {
    version: string;
    environment: string;
    gitCommit: string | null;
    buildTimestamp: string | null;
  } {
    return {
      version: process.env.npm_package_version ?? 'unknown',
      environment: process.env.NODE_ENV ?? 'unknown',
      gitCommit: process.env.GIT_COMMIT ?? null,
      buildTimestamp: process.env.BUILD_TIMESTAMP ?? null,
    };
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
