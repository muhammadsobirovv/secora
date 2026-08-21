import { Injectable } from '@nestjs/common';
import type { SecurityMetricsSummaryDto, SecurityMetricsTrendPointDto } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

interface IncidentTimingRow {
  id: string;
  createdAt: Date | string;
  resolvedAt: Date | string | null;
  closedAt: Date | string | null;
}

interface IncidentFindingLinkRow {
  incidentId: string;
  findingId: string;
}

interface RemediationTaskTimingRow {
  id: string;
  createdAt: Date | string;
  closedAt: Date | string | null;
  status: string;
}

interface SlaEventRow {
  id: string;
  eventType: string;
  breached: boolean;
  occurredAt: Date | string | null;
  createdAt: Date | string;
}

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3_600_000;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
}

/// Module 17 — task #479 (Security Metrics, spec section 24). Every
/// figure is computed at read time from timestamps `Incidents`/
/// `Remediation`/`SLA`/bug-bounty `Findings` already record — no new
/// model, no scheduled aggregation job (the platform's data volumes at
/// this scale don't need one; a future performance pass, task #494, can
/// add caching if that changes). See `SecurityMetricsSummaryDto`'s own
/// doc comment (packages/shared) for exactly which proxy each MTTx figure
/// uses and why — most importantly, MTTD and MTTV are explicitly labeled
/// "approximate" because the schema doesn't persist the exact secondary
/// timestamps a textbook MTTD/MTTV definition would want (e.g. no
/// separate "fix claimed" timestamp distinct from a finding's original
/// creation). Never silently presented as more precise than that.
@Injectable()
export class SecurityMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  private get incidentTable() {
    return (
      this.prisma as unknown as {
        incident: { findMany: (args: unknown) => Promise<IncidentTimingRow[]> };
      }
    ).incident;
  }

  private get incidentFindingLinkTable() {
    return (
      this.prisma as unknown as {
        incidentFindingLink: { findMany: (args: unknown) => Promise<IncidentFindingLinkRow[]> };
      }
    ).incidentFindingLink;
  }

  private get remediationTaskTable() {
    return (
      this.prisma as unknown as {
        remediationTask: { findMany: (args: unknown) => Promise<RemediationTaskTimingRow[]> };
      }
    ).remediationTask;
  }

  private get slaEventTable() {
    return (
      this.prisma as unknown as {
        slaEvent: { findMany: (args: unknown) => Promise<SlaEventRow[]> };
      }
    ).slaEvent;
  }

  /// `verificationStatus`/`verifiedAt` are Module 17-additive columns on
  /// the pre-existing `BugBountyFinding` model (see that model's own
  /// schema doc comment) — same stale-generated-client concern as a
  /// brand-new model's fields, so this query goes through the same cast
  /// pattern rather than `this.prisma.bugBountyFinding` directly.
  private get verifiedFindingTable() {
    return (
      this.prisma as unknown as {
        bugBountyFinding: {
          findMany: (args: unknown) => Promise<{ id: string; createdAt: Date | string; verifiedAt: Date | string | null }[]>;
        };
      }
    ).bugBountyFinding;
  }

  async summary(workspaceId: string, windowDays = 90): Promise<SecurityMetricsSummaryDto> {
    const since = new Date(Date.now() - windowDays * 86_400_000);

    const [incidents, remediationTasks, slaResolvedEvents, verifiedFindings] = await Promise.all([
      this.incidentTable.findMany({ where: { workspaceId, createdAt: { gte: since } } }),
      this.remediationTaskTable.findMany({ where: { workspaceId, createdAt: { gte: since } } }),
      this.slaEventTable.findMany({ where: { workspaceId, eventType: 'RESOLVED', createdAt: { gte: since } } }),
      this.verifiedFindingTable.findMany({
        where: { workspaceId, verificationStatus: 'VERIFIED', verifiedAt: { gte: since }, deletedAt: null },
        select: { id: true, createdAt: true, verifiedAt: true },
      }),
    ]);

    // --- MTTD: incident.createdAt - MIN(linked finding.createdAt), for
    // incidents that have at least one linked finding whose createdAt
    // predates the incident (anomalous negative gaps are excluded rather
    // than clamped/fabricated).
    const incidentIds = incidents.map((i) => i.id);
    const findingLinks = incidentIds.length
      ? await this.incidentFindingLinkTable.findMany({ where: { incidentId: { in: incidentIds } } })
      : [];
    const linkedFindingIds = [...new Set(findingLinks.map((l) => l.findingId))];
    const linkedFindings = linkedFindingIds.length
      ? await this.prisma.bugBountyFinding.findMany({
          where: { id: { in: linkedFindingIds } },
          select: { id: true, createdAt: true },
        })
      : [];
    const findingCreatedAt = new Map(linkedFindings.map((f) => [f.id, new Date(f.createdAt)]));
    const findingsByIncident = new Map<string, string[]>();
    for (const link of findingLinks) {
      const arr = findingsByIncident.get(link.incidentId) ?? [];
      arr.push(link.findingId);
      findingsByIncident.set(link.incidentId, arr);
    }

    const mttdSamples: number[] = [];
    for (const incident of incidents) {
      const linked = findingsByIncident.get(incident.id);
      if (!linked || linked.length === 0) continue;
      const earliestFindingDates = linked.map((id) => findingCreatedAt.get(id)).filter((d): d is Date => !!d);
      if (earliestFindingDates.length === 0) continue;
      const earliest = new Date(Math.min(...earliestFindingDates.map((d) => d.getTime())));
      const incidentCreatedAt = new Date(incident.createdAt);
      const gap = hoursBetween(earliest, incidentCreatedAt);
      if (gap >= 0) mttdSamples.push(gap);
    }

    // --- MTTR (incidents): createdAt -> (resolvedAt ?? closedAt).
    const mttrIncidentSamples: number[] = [];
    for (const incident of incidents) {
      const end = incident.resolvedAt ?? incident.closedAt;
      if (!end) continue;
      mttrIncidentSamples.push(hoursBetween(new Date(incident.createdAt), new Date(end)));
    }

    // --- MTTR (remediation tasks): createdAt -> closedAt, CLOSED only.
    const mttrRemediationSamples = remediationTasks
      .filter((t) => t.status === 'CLOSED' && t.closedAt)
      .map((t) => hoursBetween(new Date(t.createdAt), new Date(t.closedAt as Date | string)));

    // --- MTTV: finding.createdAt -> finding.verifiedAt, VERIFIED only.
    const mttvSamples = verifiedFindings
      .filter((f) => f.verifiedAt)
      .map((f) => hoursBetween(new Date(f.createdAt), new Date(f.verifiedAt as Date | string)));

    // --- SLA compliance: % of RESOLVED SlaEvents that were not breached.
    const slaCompliant = slaResolvedEvents.filter((e) => !e.breached).length;

    return {
      workspaceId,
      windowDays,
      mttdHours: average(mttdSamples),
      mttdSampleSize: mttdSamples.length,
      mttrIncidentHours: average(mttrIncidentSamples),
      mttrIncidentSampleSize: mttrIncidentSamples.length,
      mttrRemediationHours: average(mttrRemediationSamples),
      mttrRemediationSampleSize: mttrRemediationSamples.length,
      mttvHours: average(mttvSamples),
      mttvSampleSize: mttvSamples.length,
      slaComplianceRate: slaResolvedEvents.length > 0 ? Math.round((slaCompliant / slaResolvedEvents.length) * 1000) / 10 : null,
      slaComplianceSampleSize: slaResolvedEvents.length,
      computedAt: new Date().toISOString(),
    };
  }

  /// Weekly buckets over the trailing `weeks` weeks (default 8). Bounded
  /// and cheap — reuses the same two queries as `summary`, just windowed
  /// wider and grouped client-side into fixed 7-day buckets rather than a
  /// SQL `GROUP BY` (row counts at this scale don't warrant one; see this
  /// service's own doc comment on future caching).
  async trend(workspaceId: string, weeks = 8): Promise<SecurityMetricsTrendPointDto[]> {
    const boundedWeeks = Math.max(1, Math.min(weeks, 52));
    const windowStart = new Date(Date.now() - boundedWeeks * 7 * 86_400_000);

    const [incidents, slaResolvedEvents] = await Promise.all([
      this.incidentTable.findMany({ where: { workspaceId, createdAt: { gte: windowStart } } }),
      this.slaEventTable.findMany({ where: { workspaceId, eventType: 'RESOLVED', createdAt: { gte: windowStart } } }),
    ]);

    const points: SecurityMetricsTrendPointDto[] = [];
    for (let i = 0; i < boundedWeeks; i += 1) {
      const periodStart = new Date(windowStart.getTime() + i * 7 * 86_400_000);
      const periodEnd = new Date(periodStart.getTime() + 7 * 86_400_000);

      const resolvedInWeek = incidents.filter((incident) => {
        const end = incident.resolvedAt ?? incident.closedAt;
        if (!end) return false;
        const endDate = new Date(end);
        return endDate >= periodStart && endDate < periodEnd;
      });
      const mttrSamples = resolvedInWeek.map((incident) =>
        hoursBetween(new Date(incident.createdAt), new Date((incident.resolvedAt ?? incident.closedAt) as Date | string)),
      );

      const slaInWeek = slaResolvedEvents.filter((e) => {
        const occurred = e.occurredAt ? new Date(e.occurredAt) : new Date(e.createdAt);
        return occurred >= periodStart && occurred < periodEnd;
      });
      const slaCompliantInWeek = slaInWeek.filter((e) => !e.breached).length;

      points.push({
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        mttrIncidentHours: average(mttrSamples),
        incidentsResolved: resolvedInWeek.length,
        slaComplianceRate: slaInWeek.length > 0 ? Math.round((slaCompliantInWeek / slaInWeek.length) * 1000) / 10 : null,
        slaEventsResolved: slaInWeek.length,
      });
    }
    return points;
  }
}
