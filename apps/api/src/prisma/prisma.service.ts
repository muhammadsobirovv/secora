import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { EnvConfig } from '../config/env.validation.js';
import { PrismaClient } from '../../generated/prisma/client.js';

const slowQueryLogger = new Logger('SlowQuery');

@Injectable()
export class PrismaService
  extends PrismaClient<{
    adapter: PrismaPg;
    log: [{ emit: 'event'; level: 'query' }];
  }>
  implements OnModuleInit, OnModuleDestroy
{
  /// Module 14 — Database / Read Replica Support. `undefined` until
  /// `onModuleInit` decides whether `DATABASE_READ_REPLICA_URL` is set;
  /// `null` (a distinct state) means "checked, and there isn't one" —
  /// so `replica()` never has to re-read config on every call. A
  /// second, independent `PrismaClient` instance (not a second
  /// `PrismaService`) — it only needs the same generated client and
  /// its own connection pool, not this class's own lifecycle wiring.
  private replicaClient: PrismaClient | null | undefined;

  // @Inject(ConfigService) explicitly, not just the type annotation — under
  // tsx/esbuild, a constructor parameter typed as the generic
  // ConfigService<EnvConfig, true> doesn't get design:paramtypes metadata
  // emitted reliably, so Nest resolves it to undefined at runtime (see
  // jwt.strategy.ts for the fuller explanation; same root cause hit every
  // ConfigService<EnvConfig, true> injection point in this codebase).
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService<EnvConfig, true>,
  ) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.get('DATABASE_URL', { infer: true }),
        // Module 10 — High Availability / Performance: see
        // DATABASE_POOL_MAX's doc comment in env.validation.ts for how to
        // size this across replicas. Passed straight through to
        // node-postgres's underlying `Pool` (`PrismaPg` forwards every
        // option it doesn't itself consume).
        max: configService.get('DATABASE_POOL_MAX', { infer: true }),
      }),
      // Module 14 — Centralized Logging / Slow Query Logs. `emit: 'event'`
      // (not `'stdout'`) routes every query through `$on('query', ...)`
      // below instead of Prisma's own built-in console output, so slow
      // queries land in the same structured-JSON log stream
      // (StructuredLoggerService) as everything else rather than an
      // unstructured line Prisma prints itself.
      log: [{ emit: 'event', level: 'query' }],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    const slowQueryThresholdMs = this.configService.get('SLOW_QUERY_THRESHOLD_MS', { infer: true });
    this.$on('query', (event) => {
      if (event.duration >= slowQueryThresholdMs) {
        slowQueryLogger.warn(
          `Slow query (${event.duration}ms, threshold ${slowQueryThresholdMs}ms): ${event.query}`,
          { durationMs: event.duration, target: event.target },
        );
      }
    });

    const replicaUrl = this.configService.get('DATABASE_READ_REPLICA_URL', { infer: true });
    if (replicaUrl) {
      this.replicaClient = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: replicaUrl,
          max: this.configService.get('DATABASE_READ_REPLICA_POOL_MAX', { infer: true }),
        }),
      });
      await this.replicaClient.$connect();
    } else {
      this.replicaClient = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.replicaClient?.$disconnect();
  }

  /// Module 14 — Database / Read Replica Support. Returns a Prisma
  /// client pointed at `DATABASE_READ_REPLICA_URL` if one is
  /// configured, or `this` (the primary connection) otherwise — so
  /// every call site is safe to write unconditionally as
  /// `prisma.replica().someModel.findMany(...)` regardless of whether
  /// a replica is actually configured (Community Edition's default:
  /// no replica, this degrades to reading from primary, which is
  /// exactly correct behavior, not a fallback hack).
  ///
  /// Deliberately opt-in per call site rather than a query-level
  /// router that auto-detects reads vs. writes: Prisma has no
  /// supported hook for "is this specific call read-only," and a
  /// naive one (assume every `find*`/`count`/`aggregate` call is
  /// read-only) would be wrong inside a `$transaction` that mixes
  /// reads and writes for consistency — silently reading stale
  /// replica data inside a transaction that just wrote the row you're
  /// about to read is a worse bug than "some read-heavy call sites
  /// haven't been migrated to `replica()` yet." Callers should only
  /// use this for queries that can tolerate typical Postgres streaming-
  /// replication lag (milliseconds to low seconds) — dashboards,
  /// analytics aggregates, list views — never immediately after a
  /// write whose result the same request needs to see.
  replica(): PrismaClient {
    return this.replicaClient ?? this;
  }

  /// `true` once `onModuleInit` has determined a replica is
  /// configured — lets a caller choose a different strategy (e.g. skip
  /// `replica()` and read from primary anyway) rather than silently
  /// getting primary-as-fallback if it specifically needs to know.
  hasReadReplica(): boolean {
    return this.replicaClient != null;
  }
}
