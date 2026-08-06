import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.validation.js';
import { PollerLeaseService } from '../../common/concurrency/poller-lease.service.js';
import { McpSessionRepository } from './mcp-session.repository.js';

const LEASE_NAME = 'mcp-session-cleanup';
const LEASE_TTL_MS = 90_000;

/// Idle-session sweep — same hand-rolled `setInterval` +
/// `OnModuleInit`/`OnModuleDestroy` + `PollerLeaseService` shape as
/// `WebhookDeliveryQueueService` (Module 9/10), reused rather than
/// adding `@nestjs/schedule`. Marks any `ACTIVE` `McpSession` idle for
/// longer than `MCP_SESSION_IDLE_TIMEOUT_MINUTES` as `EXPIRED`.
@Injectable()
export class McpSessionCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpSessionCleanupService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly sessions: McpSessionRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly leases: PollerLeaseService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  private async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, () => this.runTick());
  }

  private async runTick(): Promise<void> {
    const idleMinutes = this.configService.get('MCP_SESSION_IDLE_TIMEOUT_MINUTES', { infer: true });
    const expired = await this.sessions.expireIdleSessions(idleMinutes);
    if (expired > 0) this.logger.log(`Expired ${expired} idle MCP session(s).`);
  }
}
