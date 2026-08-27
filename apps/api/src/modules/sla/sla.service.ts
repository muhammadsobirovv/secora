import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { SlaEventDto, SlaEventType, SlaPolicyDto, VulnFindingSeverity } from '@pentesthub/shared';
import type { AuditEventType } from '../../prisma-types.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PollerLeaseService } from '../../common/concurrency/poller-lease.service.js';
import { SlaBreachedEvent } from './events/sla-breached.event.js';

interface SlaPolicyRow {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  severity: string;
  targetHours: number;
  createdAt: Date | string;
}

interface SlaEventRow {
  id: string;
  workspaceId: string;
  incidentId: string | null;
  findingId: string | null;
  policyId: string;
  eventType: string;
  dueAt: Date | string;
  occurredAt: Date | string | null;
  breached: boolean;
  createdAt: Date | string;
}

function toPolicyDto(row: SlaPolicyRow): SlaPolicyDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    severity: row.severity as VulnFindingSeverity,
    targetHours: row.targetHours,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function toEventDto(row: SlaEventRow): SlaEventDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    incidentId: row.incidentId,
    findingId: row.findingId,
    policyId: row.policyId,
    eventType: row.eventType as SlaEventType,
    dueAt: new Date(row.dueAt).toISOString(),
    occurredAt: row.occurredAt ? new Date(row.occurredAt).toISOString() : null,
    breached: row.breached,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

const LEASE_NAME = 'sla-breach-checker';
const LEASE_TTL_MS = 60_000;

/// Module 17 — task #478 (SLA Engine, spec section 23). `SlaPolicy` is a
/// Module 10 model with a real typed Prisma accessor already (see
/// `enterprise-analytics.query.ts`'s existing read of it) — only
/// `SlaEvent` (this task's new persisted event log; see that model's own
/// schema doc comment for why it was added alongside the pre-existing
/// read-time-only policy) needs the brand-new-model Prisma-cast pattern.
///
/// `startClock`/`resolveClock` are called directly from `IncidentsService`
/// (see that file's `create`/`updateStatus`) rather than through a new
/// event — SLA tracking is a synchronous side effect of those two
/// lifecycle points, not something another module needs to react to
/// asynchronously, so a direct injected call is simpler and no less
/// correct than adding EventBus plumbing for it. A missing policy for a
/// given workspace/severity is not an error — spec's Community Edition
/// guarantee means SLA tracking is opt-in (an operator who never
/// configures a policy just gets no SLA events), not a mandatory
/// dependency.
@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  private get eventTable() {
    return (
      this.prisma as unknown as {
        slaEvent: {
          create: (args: unknown) => Promise<SlaEventRow>;
          findMany: (args: unknown) => Promise<SlaEventRow[]>;
        };
      }
    ).slaEvent;
  }

  async resolvePolicy(workspaceId: string, severity: VulnFindingSeverity): Promise<SlaPolicyRow | null> {
    const workspaceScoped = await this.prisma.slaPolicy.findFirst({ where: { workspaceId, severity } });
    if (workspaceScoped) return workspaceScoped;
    // Enterprise org-wide fallback: a policy with no workspaceId at all,
    // scoped only by organizationId. Community Edition workspaces have no
    // Organization, so this simply never matches for them — not an error.
    return this.prisma.slaPolicy.findFirst({ where: { workspaceId: null, severity } });
  }

  async listPolicies(workspaceId: string): Promise<SlaPolicyDto[]> {
    const rows = await this.prisma.slaPolicy.findMany({ where: { workspaceId }, orderBy: { severity: 'asc' } });
    return rows.map(toPolicyDto);
  }

  /// Manual find-then-create/update rather than `upsert` — `SlaPolicy`'s
  /// unique key is `(organizationId, workspaceId, severity)` with both
  /// `organizationId` and `workspaceId` nullable; Prisma's compound-unique
  /// `where` input handling for nullable composite keys is exactly the
  /// kind of edge case that bit `ThreatActor`/`ThreatCampaign` upserts
  /// earlier this module (see `threat-intel-catalog.service.ts`'s doc
  /// comment on that fix) — avoided here the same way.
  async upsertPolicy(workspaceId: string, userId: string, severity: VulnFindingSeverity, targetHours: number): Promise<SlaPolicyDto> {
    const existing = await this.prisma.slaPolicy.findFirst({ where: { organizationId: null, workspaceId, severity } });
    const row = existing
      ? await this.prisma.slaPolicy.update({ where: { id: existing.id }, data: { targetHours } })
      : await this.prisma.slaPolicy.create({ data: { organizationId: null, workspaceId, severity, targetHours } });
    // Task #499 (final review — "confirm AuditLog mandatory everywhere"):
    // `SLA_POLICY_CHANGED` already existed in the schema's AuditEventType
    // enum for exactly this write, but nothing called it. A workspace's
    // SLA targets are a security-relevant config surface (they drive
    // breach detection and the SOC dashboard) — fixed to match every
    // other config-changing write path in this module.
    await this.audit(userId, 'SLA_POLICY_CHANGED', {
      workspaceId,
      severity,
      targetHours,
      previousTargetHours: existing?.targetHours ?? null,
    });
    return toPolicyDto(row);
  }

  private async audit(userId: string, type: AuditEventType, metadata: Record<string, unknown>): Promise<void> {
    await this.prisma.auditEvent.create({
      data: { userId, type, ipAddress: '0.0.0.0', userAgent: 'api', metadata },
    });
  }

  async startClock(workspaceId: string, severity: VulnFindingSeverity, entity: { incidentId?: string; findingId?: string }): Promise<void> {
    const policy = await this.resolvePolicy(workspaceId, severity);
    if (!policy) return;
    const dueAt = new Date(Date.now() + policy.targetHours * 3_600_000);
    await this.eventTable.create({
      data: {
        workspaceId,
        incidentId: entity.incidentId ?? null,
        findingId: entity.findingId ?? null,
        policyId: policy.id,
        eventType: 'STARTED',
        dueAt,
        breached: false,
      },
    });
  }

  async resolveClock(workspaceId: string, entity: { incidentId?: string; findingId?: string }): Promise<void> {
    const started = await this.latestUnresolvedStart(workspaceId, entity);
    if (!started) return;
    const occurredAt = new Date();
    const breached = occurredAt.getTime() > new Date(started.dueAt).getTime();
    await this.eventTable.create({
      data: {
        workspaceId,
        incidentId: entity.incidentId ?? null,
        findingId: entity.findingId ?? null,
        policyId: started.policyId,
        eventType: 'RESOLVED',
        dueAt: started.dueAt,
        occurredAt,
        breached,
      },
    });
  }

  private async latestUnresolvedStart(workspaceId: string, entity: { incidentId?: string; findingId?: string }): Promise<SlaEventRow | null> {
    const events = await this.eventTable.findMany({
      where: { workspaceId, incidentId: entity.incidentId ?? null, findingId: entity.findingId ?? null },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const latestStarted = events.find((e) => e.eventType === 'STARTED');
    if (!latestStarted) return null;
    const alreadyResolved = events.some(
      (e) => e.eventType === 'RESOLVED' && new Date(e.createdAt).getTime() > new Date(latestStarted.createdAt).getTime(),
    );
    return alreadyResolved ? null : latestStarted;
  }

  async listEventsForWorkspace(
    workspaceId: string,
    filters: { incidentId?: string; findingId?: string; breachedOnly?: boolean; limit?: number },
  ): Promise<SlaEventDto[]> {
    const rows = await this.eventTable.findMany({
      where: {
        workspaceId,
        ...(filters.incidentId ? { incidentId: filters.incidentId } : {}),
        ...(filters.findingId ? { findingId: filters.findingId } : {}),
        ...(filters.breachedOnly ? { breached: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100,
    });
    return rows.map(toEventDto);
  }

  /// Bounded scan for STARTED clocks past their `dueAt` with no RESOLVED
  /// (or already-recorded BREACHED) counterpart yet — called by
  /// `SlaBreachCheckerService`'s poll loop, not directly by any
  /// controller.
  async checkForBreaches(): Promise<number> {
    const overdue = await this.eventTable.findMany({
      where: { eventType: 'STARTED', dueAt: { lt: new Date() } },
      orderBy: { dueAt: 'asc' },
      take: 200,
    });

    let created = 0;
    for (const started of overdue) {
      const later = await this.eventTable.findMany({
        where: { workspaceId: started.workspaceId, incidentId: started.incidentId, findingId: started.findingId, policyId: started.policyId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      const alreadyHandled = later.some(
        (e) =>
          (e.eventType === 'RESOLVED' || e.eventType === 'BREACHED') &&
          new Date(e.createdAt).getTime() > new Date(started.createdAt).getTime(),
      );
      if (alreadyHandled) continue;

      const breachedRow = await this.eventTable.create({
        data: {
          workspaceId: started.workspaceId,
          incidentId: started.incidentId,
          findingId: started.findingId,
          policyId: started.policyId,
          eventType: 'BREACHED',
          dueAt: started.dueAt,
          occurredAt: new Date(),
          breached: true,
        },
      });
      created += 1;

      // Module 17 — task #487 (Automation rules engine). Best-effort:
      // the SlaEvent row above is the durable record of the breach
      // regardless of whether this publish succeeds or any rule matches
      // it, so a failure here is logged, never rethrown, and never
      // blocks the rest of this bounded scan.
      try {
        const policy = await this.prisma.slaPolicy.findUnique({ where: { id: started.policyId } });
        this.eventBus.publish(
          new SlaBreachedEvent(started.workspaceId, breachedRow.id, policy?.severity ?? 'MEDIUM', started.incidentId, started.findingId),
        );
      } catch (error: unknown) {
        this.logger.warn(`Failed to publish SlaBreachedEvent for SlaEvent ${breachedRow.id}: ${String(error)}`);
      }
    }
    return created;
  }
}

/// Best-effort HA-safe poller mirroring `ContinuousMonitoringService`'s
/// own `OnModuleInit`/`OnModuleDestroy` + `PollerLeaseService.withLease`
/// pattern (see that service's doc comment for why hand-rolled
/// `setInterval` was chosen over `@nestjs/schedule`). A detected breach
/// always persists an `SlaEvent` row and now also publishes a
/// `SlaBreachedEvent` (task #487) that `AutomationRulesModule` subscribes
/// to — see that event's own doc comment. There is still no dedicated
/// Notification Engine (task #482) subscriber; an operator who wants a
/// notification on every breach configures a `NOTIFY`-action automation
/// rule with `triggerType: 'SLA_BREACH'` in the meantime.
@Injectable()
export class SlaBreachCheckerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaBreachCheckerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly sla: SlaService,
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

  async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, async () => {
      try {
        const created = await this.sla.checkForBreaches();
        if (created > 0) this.logger.log(`Recorded ${created} SLA breach event(s).`);
      } catch (error: unknown) {
        this.logger.warn(`SLA breach check failed: ${String(error)}`);
      }
    });
  }
}
