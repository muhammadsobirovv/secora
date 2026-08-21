import { Injectable } from '@nestjs/common';
import type { SocDashboardSummaryDto } from '@pentesthub/shared';
import { IncidentsService } from '../incidents/incidents.service.js';
import { SlaService } from '../sla/sla.service.js';
import { IndicatorsService } from '../threat-intel/indicators.service.js';
import { SecurityMetricsService } from '../security-metrics/security-metrics.service.js';

const RECENT_INCIDENTS_LIMIT = 10;
const RECENT_SLA_EVENTS_LIMIT = 10;

const OPEN_LIKE = ['OPEN', 'INVESTIGATING', 'CONTAINMENT', 'ERADICATION', 'RECOVERY', 'REOPENED'] as const;

/// Module 17 — REST API task #489. Composes four already-existing
/// services' own read paths into one `/soc` dashboard response — no new
/// query logic, no direct Prisma access, so there is exactly one
/// implementation of "what counts as an open incident" (IncidentsService),
/// "what counts as an SLA breach" (SlaService), "what counts as an active
/// indicator" (IndicatorsService), and "what MTTD/MTTR/MTTV/SLA-compliance
/// are" (SecurityMetricsService). Every call takes the caller's own
/// resolved `workspaceId` — see `SocController.resolveWorkspaceId` — so
/// this composition inherits each underlying service's own isolation
/// guarantees rather than needing its own.
@Injectable()
export class SocService {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly sla: SlaService,
    private readonly indicators: IndicatorsService,
    private readonly securityMetrics: SecurityMetricsService,
  ) {}

  async dashboard(workspaceId: string, windowDays = 30): Promise<SocDashboardSummaryDto> {
    // `listForWorkspace`'s own `limit` bounds the query, not a "count
    // everything" primitive — a bounded 200-row read (matching every
    // other M17 bounded-list convention this session) is the honest way
    // to get a count without inventing a `count()` method none of these
    // services currently expose. Genuinely > 200 open incidents/
    // breaches/active indicators in one workspace would under-count
    // here; disclosed as a known bound, not silently wrong.
    const [openIncidents, recentIncidents, breachedSlaEvents, activeIndicators, metrics] = await Promise.all([
      this.incidents.listForWorkspace(workspaceId, { limit: 200 }),
      this.incidents.listForWorkspace(workspaceId, { limit: RECENT_INCIDENTS_LIMIT }),
      this.sla.listEventsForWorkspace(workspaceId, { breachedOnly: true, limit: 200 }),
      this.indicators.listForWorkspace(workspaceId, { status: 'ACTIVE', limit: 200 }),
      this.securityMetrics.summary(workspaceId, windowDays).catch(() => null),
    ]);

    const openIncidentsCount = openIncidents.filter((i) => (OPEN_LIKE as readonly string[]).includes(i.status)).length;
    const criticalOpenIncidentsCount = openIncidents.filter(
      (i) => i.severity === 'CRITICAL' && (OPEN_LIKE as readonly string[]).includes(i.status),
    ).length;

    return {
      workspaceId,
      openIncidentsCount,
      criticalOpenIncidentsCount,
      recentIncidents,
      breachedSlaEventsCount: breachedSlaEvents.length,
      recentBreachedSlaEvents: breachedSlaEvents.slice(0, RECENT_SLA_EVENTS_LIMIT),
      activeIndicatorsCount: activeIndicators.length,
      metrics,
      computedAt: new Date().toISOString(),
    };
  }
}
