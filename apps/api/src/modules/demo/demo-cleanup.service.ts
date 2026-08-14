import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PollerLeaseService } from '../../common/concurrency/poller-lease.service.js';

const LEASE_NAME = 'demo-cleanup';
const LEASE_TTL_MS = 90_000;
const TICK_MS = 60_000;

/// Module 15 — task #352 (demo mode). Same hand-rolled `setInterval` +
/// `OnModuleInit`/`OnModuleDestroy` + `PollerLeaseService` shape as
/// `McpSessionCleanupService` (Module 13) and `WebhookDeliveryQueueService`
/// (Module 9/10) — reused rather than adding `@nestjs/schedule`.
///
/// Deletes the demo `User` (not just the `Workspace`) once
/// `demoExpiresAt` has passed: the user row has no password and no real
/// email inbox behind it, so it has no value to retain, and removing it
/// lets the FK cascades already defined across the schema (every demo
/// user's `WorkspaceMember`/`Project`/`Target`/... row ultimately chains
/// back to either the user or the `onDelete: Cascade` workspace
/// relation) clean up the rest without this service needing to know
/// every table a demo workspace could have touched.
@Injectable()
export class DemoCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemoCleanupService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: PollerLeaseService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  private async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, () => this.runTick());
  }

  private async runTick(): Promise<void> {
    const expired = await this.prisma.workspace.findMany({
      where: { isDemo: true, demoExpiresAt: { lte: new Date() } },
      select: { id: true, members: { where: { role: 'OWNER' }, select: { userId: true }, take: 1 } },
    });

    let deleted = 0;
    for (const workspace of expired) {
      const ownerId = workspace.members[0]?.userId;
      try {
        if (ownerId) {
          // Deleting the owning User cascades WorkspaceMember and every
          // Cascade-linked table beneath the Workspace. If somehow no
          // owner is found (shouldn't happen — start() always adds one),
          // fall back to deleting the Workspace row directly instead of
          // leaving it expired forever.
          await this.prisma.user.delete({ where: { id: ownerId } });
        } else {
          await this.prisma.workspace.delete({ where: { id: workspace.id } });
        }
        deleted += 1;
      } catch (error) {
        this.logger.warn(`Failed to clean up expired demo workspace ${workspace.id}`, error);
      }
    }

    if (deleted > 0) this.logger.log(`Cleaned up ${deleted} expired demo workspace(s).`);
  }
}
