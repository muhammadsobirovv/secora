import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { SocSearchResultDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { resolveWorkspaceForCaller } from '../../bugbounty/authorization.util.js';

const PER_TYPE_LIMIT = 10;

function snippet(text: string | null | undefined, length = 140): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > length ? `${trimmed.slice(0, length)}…` : trimmed;
}

export class SearchSocQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly q: string,
  ) {}
}

/// Module 17 — Global Search extension (task #483). Same shape as
/// `SearchBugBountyHandler` — composed into `GlobalSearchHandler` via
/// `QueryBus.execute()`, not called directly, so `SearchModule` needn't
/// import `IncidentsModule`/`SlaModule`/`ThreatIntelModule`/
/// `RemediationModule` (CQRS's explorer discovers this provider app-wide
/// once it's registered anywhere — see `SearchModule`'s own doc comment).
///
/// Direct Prisma casts, not repository interfaces — every entity here
/// (Incident, AssetGraphNode, Indicator, ThreatActor, ThreatCampaign,
/// RemediationTask) is itself accessed via the same direct-cast pattern
/// in its own owning service (the sandbox's stale `@prisma/client` has
/// no typed accessor for any Module 16/17 model — see
/// `IncidentsService`'s doc comment for the precedent), so there's no
/// existing repository interface to inject here either.
///
/// Threat-intel entities (Indicator/ThreatActor/ThreatCampaign) use the
/// same `OR: [{ workspaceId }, { workspaceId: null }]` scoping every
/// other threat-intel read in this codebase uses (see
/// `ThreatIntelCatalogService`) — `workspaceId: null` rows are the
/// shared/global cache, not another tenant's private data.
///
/// `RemediationTask` has no `title` column (see its Prisma model) —
/// `notes` is the only free-text field, so it's both the match target
/// and the snippet source; the synthesized title below
/// (`priority — owner/team/unassigned`) exists purely to give search
/// results something displayable, not because the underlying row has a
/// title concept.
@QueryHandler(SearchSocQuery)
export class SearchSocHandler implements IQueryHandler<SearchSocQuery, SocSearchResultDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly prisma: PrismaService,
  ) {}

  private get tables() {
    return this.prisma as unknown as {
      incident: { findMany: (args: unknown) => Promise<Array<{ id: string; title: string; description: string }>> };
      assetGraphNode: { findMany: (args: unknown) => Promise<Array<{ id: string; label: string; nodeType: string }>> };
      indicator: { findMany: (args: unknown) => Promise<Array<{ id: string; value: string; description: string | null }>> };
      threatActor: { findMany: (args: unknown) => Promise<Array<{ id: string; name: string; description: string | null }>> };
      threatCampaign: { findMany: (args: unknown) => Promise<Array<{ id: string; name: string; description: string | null }>> };
      remediationTask: {
        findMany: (args: unknown) => Promise<Array<{ id: string; priority: string; owner: string | null; team: string | null; notes: string | null }>>;
      };
    };
  }

  async execute(query: SearchSocQuery): Promise<SocSearchResultDto[]> {
    const workspace = await resolveWorkspaceForCaller(this.workspacesRepository, query.userId);
    const q = query.q.trim();
    if (!q) return [];

    const contains = { contains: q, mode: 'insensitive' as const };
    const cacheScope = { OR: [{ workspaceId: workspace.id }, { workspaceId: null }] };

    const [incidents, assetNodes, indicators, actors, campaigns, remediationTasks] = await Promise.all([
      this.tables.incident.findMany({
        where: { workspaceId: workspace.id, OR: [{ title: contains }, { description: contains }] },
        take: PER_TYPE_LIMIT,
      }),
      this.tables.assetGraphNode.findMany({
        where: { workspaceId: workspace.id, label: contains },
        take: PER_TYPE_LIMIT,
      }),
      this.tables.indicator.findMany({
        where: { ...cacheScope, OR: [{ value: contains }, { description: contains }] },
        take: PER_TYPE_LIMIT,
      }),
      this.tables.threatActor.findMany({
        where: { ...cacheScope, OR: [{ name: contains }, { description: contains }] },
        take: PER_TYPE_LIMIT,
      }),
      this.tables.threatCampaign.findMany({
        where: { ...cacheScope, OR: [{ name: contains }, { description: contains }] },
        take: PER_TYPE_LIMIT,
      }),
      this.tables.remediationTask.findMany({
        where: { workspaceId: workspace.id, notes: contains },
        take: PER_TYPE_LIMIT,
      }),
    ]);

    const results: SocSearchResultDto[] = [
      ...incidents.map((i): SocSearchResultDto => ({ type: 'INCIDENT', id: i.id, title: i.title, snippet: snippet(i.description) })),
      ...assetNodes.map((n): SocSearchResultDto => ({ type: 'ASSET_GRAPH_NODE', id: n.id, title: n.label, snippet: n.nodeType })),
      ...indicators.map((ind): SocSearchResultDto => ({ type: 'INDICATOR', id: ind.id, title: ind.value, snippet: snippet(ind.description) })),
      ...actors.map((a): SocSearchResultDto => ({ type: 'THREAT_ACTOR', id: a.id, title: a.name, snippet: snippet(a.description) })),
      ...campaigns.map((c): SocSearchResultDto => ({ type: 'THREAT_CAMPAIGN', id: c.id, title: c.name, snippet: snippet(c.description) })),
      ...remediationTasks.map((t): SocSearchResultDto => ({
        type: 'REMEDIATION_TASK',
        id: t.id,
        title: `${t.priority} remediation — ${t.owner ?? t.team ?? 'unassigned'}`,
        snippet: snippet(t.notes),
      })),
    ];

    return results;
  }
}
