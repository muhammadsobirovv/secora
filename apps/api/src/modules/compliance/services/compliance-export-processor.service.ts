import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ComplianceExportScope } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { STORAGE_SERVICE } from '../../../common/providers/tokens.js';
import type { StorageService } from '../../../common/providers/storage/storage-service.interface.js';
import { PollerLeaseService } from '../../../common/concurrency/poller-lease.service.js';

const TICK_INTERVAL_MS = 60_000;
const LEASE_NAME = 'compliance-export-processor';
const LEASE_TTL_MS = 90_000; // 1.5x the 60s tick interval — see PollerLeaseService's doc comment.

/// Processes PENDING `ComplianceExportRequest` rows into a real JSON
/// export file — the GDPR/SOC2 "right to export" flow. Same minute-tick
/// poller shape as `WebhookDeliveryQueueService`/`ScheduledJobRunnerService`.
///
/// Scope (v1): exports `AUDIT_EVENTS` (filtered to `subjectUserId` when
/// set — the standard GDPR Subject Access Request shape: "everything you
/// have about user X"), `ORGANIZATION_MEMBERS`, `WORKFLOWS`, and
/// `INTEGRATION_CONNECTIONS` (metadata only — provider/status/timestamps,
/// never the encrypted credential itself). A request with no
/// `resourceTypes` in scope exports all four. This intentionally does
/// NOT walk every one of the ~40+ tenant-scoped tables in this schema —
/// see the class's resourceTypes union in packages/shared/src/
/// compliance.ts for the exact disclosed v1 boundary; extending coverage
/// to bug bounty findings/reports/reports is the natural next step and
/// only requires adding a case below, not a redesign.
@Injectable()
export class ComplianceExportProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComplianceExportProcessorService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly leases: PollerLeaseService,
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
  /// one replica processes pending export requests per tick.
  async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, () => this.runTick());
  }

  private async runTick(): Promise<void> {
    const due = await this.prisma.complianceExportRequest.findMany({ where: { status: 'PENDING' }, take: 20 });
    for (const request of due) {
      try {
        await this.process(request.id);
      } catch (error) {
        this.logger.error(`Compliance export ${request.id} failed`, error instanceof Error ? error.stack : String(error));
        await this.prisma.complianceExportRequest.update({
          where: { id: request.id },
          data: { status: 'FAILED', completedAt: new Date() },
        });
      }
    }
  }

  private async process(requestId: string): Promise<void> {
    await this.prisma.complianceExportRequest.update({ where: { id: requestId }, data: { status: 'PROCESSING' } });
    const request = await this.prisma.complianceExportRequest.findUniqueOrThrow({ where: { id: requestId } });
    const scope = (request.scope as unknown as ComplianceExportScope) ?? {};
    const resourceTypes = scope.resourceTypes ?? [
      'AUDIT_EVENTS',
      'ORGANIZATION_MEMBERS',
      'WORKFLOWS',
      'INTEGRATION_CONNECTIONS',
    ];

    const payload: Record<string, unknown> = {
      organizationId: request.organizationId,
      requestedBy: request.requestedBy,
      subjectUserId: scope.subjectUserId ?? null,
      generatedAt: new Date().toISOString(),
    };

    if (resourceTypes.includes('AUDIT_EVENTS')) {
      // AuditEvent has no organizationId column (it's per-user, not
      // per-tenant — see its schema comment), so scoping "this
      // organization's audit events" requires resolving membership
      // first and filtering by userId — without this, an org admin's
      // export would leak every user's audit trail system-wide,
      // regardless of organization membership.
      const memberUserIds = (
        await this.prisma.organizationMember.findMany({
          where: { organizationId: request.organizationId },
          select: { userId: true },
        })
      ).map((m) => m.userId);
      const targetUserIds = scope.subjectUserId
        ? memberUserIds.filter((id) => id === scope.subjectUserId)
        : memberUserIds;

      payload.auditEvents =
        targetUserIds.length === 0
          ? []
          : await this.prisma.auditEvent.findMany({
              where: { userId: { in: targetUserIds } },
              orderBy: { createdAt: 'desc' },
              take: 5000,
            });
    }
    if (resourceTypes.includes('ORGANIZATION_MEMBERS')) {
      payload.organizationMembers = await this.prisma.organizationMember.findMany({
        where: {
          organizationId: request.organizationId,
          ...(scope.subjectUserId ? { userId: scope.subjectUserId } : {}),
        },
      });
    }
    if (resourceTypes.includes('WORKFLOWS')) {
      payload.workflows = await this.prisma.workflow.findMany({ where: { organizationId: request.organizationId } });
    }
    if (resourceTypes.includes('INTEGRATION_CONNECTIONS')) {
      payload.integrationConnections = await this.prisma.integrationConnection.findMany({
        where: { organizationId: request.organizationId },
        select: {
          id: true,
          provider: true,
          status: true,
          workspaceId: true,
          lastSyncedAt: true,
          createdAt: true,
          // credentials (encrypted) deliberately never selected.
        },
      });
    }

    const key = `compliance-exports/${request.organizationId}/${request.id}.json`;
    const { url } = await this.storageService.upload(
      key,
      Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
      'application/json',
    );

    await this.prisma.complianceExportRequest.update({
      where: { id: request.id },
      data: { status: 'READY', downloadUrl: url, completedAt: new Date() },
    });
  }
}
