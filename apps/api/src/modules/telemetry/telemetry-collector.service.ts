import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { TelemetryPingDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../user-preferences/domain/repositories/user-preferences.repository.interface.js';

const FLUSH_INTERVAL_MS = 24 * 60 * 60 * 1000; // once/day — an aggregate ping, not a stream.
const SEND_TIMEOUT_MS = 10_000;

/// Module 15 — task #347 "Telemetry — opt-in, privacy-aware framework".
///
/// Two independent gates, both must be open before anything is counted or
/// sent:
///  1. Operator-level: `TELEMETRY_ENABLED` (env.validation.ts, default
///     `false`) — self-hosted deployments send nothing unless the
///     operator explicitly turns this on. The overwhelmingly common case
///     (telemetry off) short-circuits `record()` before it does anything
///     at all, including any database read.
///  2. User-level: `UserPreferences.telemetryOptOut` (task #342, default
///     `false` = opted in, matching the operator's own default-off
///     posture) — only checked when gate 1 is already open, so a
///     deployment with telemetry off never pays the extra per-event
///     preference lookup.
///
/// What's collected is deliberately coarse: in-memory counters keyed by
/// `"<ENTITY_TYPE>:<verb>"` (see `TelemetryRecordingHandler`), never a
/// per-event record and never anything tied to a specific user, workspace,
/// or piece of content. Once a day, the accumulated counts are flushed as
/// a single `TelemetryPingDto` to `TELEMETRY_ENDPOINT` and the counters
/// reset — this is intentionally lossy/best-effort: a failed send just
/// drops that period's counts rather than retrying or growing an
/// unbounded backlog, since this is usage telemetry, not billing or audit
/// data where loss would matter.
///
/// `instanceId` needs to be *some* stable value so the maintainers can
/// tell "one instance pinging daily" apart from "many different
/// instances," without persisting a new column anywhere (this project's
/// generated Prisma client is already disclosed as out of sync with
/// schema.prisma for every M15 schema addition — see task #365 — so this
/// pass deliberately avoids adding one more unverifiable field for
/// something this minor). Instead it's derived by one-way hashing the
/// earliest-created `User.id` already in the database — stable across
/// restarts for a given deployment, not reversible back to that id, and
/// requires no new schema. A deployment with zero users yet has nothing
/// telemetry-worthy to report anyway, so `flush()` simply skips that tick.
@Injectable()
export class TelemetryCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryCollectorService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;
  private counters = new Map<string, number>();
  private periodStart = new Date();

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly userPreferencesRepository: UserPreferencesRepository,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  private isEnabled(): boolean {
    return this.configService.get('TELEMETRY_ENABLED', { infer: true });
  }

  /// Called by `TelemetryRecordingHandler` for every subscribed domain
  /// event. Fire-and-forget by design — a telemetry failure must never
  /// affect the request/job that triggered the underlying domain event.
  async record(featureKey: string, actorUserId: string | null): Promise<void> {
    if (!this.isEnabled()) return;

    if (actorUserId) {
      try {
        const prefs = await this.userPreferencesRepository.findByUserId(actorUserId);
        if (prefs?.telemetryOptOut) return;
      } catch (error) {
        // A failed preference lookup should not silently start counting
        // an event for a user we couldn't confirm hasn't opted out — fail
        // closed (skip) rather than fail open.
        this.logger.warn(`Skipping telemetry event "${featureKey}" — could not resolve user preferences: ${String(error)}`);
        return;
      }
    }

    this.counters.set(featureKey, (this.counters.get(featureKey) ?? 0) + 1);
  }

  private async resolveInstanceId(): Promise<string | null> {
    const earliestUser = await this.prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!earliestUser) return null;
    return createHash('sha256').update(`pentesthub-telemetry:${earliestUser.id}`).digest('hex').slice(0, 32);
  }

  async flush(): Promise<void> {
    if (!this.isEnabled()) {
      this.counters.clear();
      return;
    }
    if (this.counters.size === 0) {
      this.periodStart = new Date();
      return;
    }

    const endpoint = this.configService.get('TELEMETRY_ENDPOINT', { infer: true });
    const periodEnd = new Date();
    const featureCounts = Object.fromEntries(this.counters);
    // Reset immediately, before the network call — a slow/failed send
    // must never cause counts to double up into the next period.
    this.counters.clear();
    const periodStart = this.periodStart;
    this.periodStart = periodEnd;

    if (!endpoint) {
      // Operator turned telemetry on but never configured where to send
      // it — nothing to do besides having already reset the counters
      // above (no unbounded accumulation while misconfigured).
      return;
    }

    const instanceId = await this.resolveInstanceId().catch(() => null);
    if (!instanceId) return;

    const ping: TelemetryPingDto = {
      instanceId,
      edition: this.configService.get('PENTESTHUB_EDITION', { infer: true }),
      platformVersion: process.env.npm_package_version ?? 'unknown',
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      featureCounts,
    };

    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ping),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`Telemetry ping failed to send — dropping this period's counts: ${String(error)}`);
    }
  }
}
