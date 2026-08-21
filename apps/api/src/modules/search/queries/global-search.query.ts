import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import type { GlobalSearchResultDto, GlobalSearchResultType, SearchResultDto, BugBountySearchResultDto, SocSearchResultDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { SearchQuery } from './search.query.js';
import { SearchBugBountyQuery } from '../../bugbounty/queries/search-bugbounty.query.js';
import { SearchSocQuery } from './search-soc.query.js';

const PER_TYPE_LIMIT = 10;
const SNIPPET_LENGTH = 160;

function snippet(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > SNIPPET_LENGTH ? `${trimmed.slice(0, SNIPPET_LENGTH)}…` : trimmed;
}

export class GlobalSearchQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly q: string,
  ) {}
}

/// Module 15 — Global Search unification (task #339). This does NOT
/// replace `SearchHandler` (Module 2) or `SearchBugBountyHandler` (Module
/// 6/9) — both keep serving their existing endpoints unmodified for their
/// existing callers (web's `use-search.ts`, mobile's
/// `global_search_repository.dart` — see that file's own doc comment
/// disclosing it deliberately only calls the 4-type endpoint). Instead
/// this handler *composes* them via `QueryBus.execute()` (the same
/// cross-module composition CQRS is meant to enable — no direct
/// cross-module repository imports needed for the two entity families
/// that already have a query) and adds the three entity types Module
/// 13/15 introduced that neither predecessor covers: PLUGIN, WORKFLOW,
/// SECURITY_ADVISORY.
///
/// Scoping note: `Plugin`/`Workflow` are organization-scoped
/// (`organizationId`), not workspace-scoped — a personal (non-Enterprise)
/// workspace has `organizationId: null` and simply yields no results for
/// those two types rather than erroring, the same graceful-empty posture
/// every other Enterprise-gated feature in this codebase takes for
/// Community Edition callers. `SecurityAdvisory` has no scoping at all —
/// it's public information about marketplace plugins, matched globally.
///
/// Module 17 — Global Search extension (task #483) added a third
/// composed handler the same way: `SearchSocHandler` covers Incident/
/// AssetGraphNode/Indicator/ThreatActor/ThreatCampaign/RemediationTask
/// — see that handler's own doc comment for scoping notes (threat-intel
/// entities use the existing nullable-`workspaceId` "shared cache"
/// pattern, not a new one).
///
/// Known follow-up, not done in this pass: migrating the web/mobile
/// clients from `/search` + `/bugbounty/search` onto this single
/// `/search/global` endpoint is a frontend change outside this backend
/// task's scope — both old endpoints remain the source of truth for
/// existing UI until that migration happens.
@QueryHandler(GlobalSearchQuery)
export class GlobalSearchHandler implements IQueryHandler<GlobalSearchQuery, GlobalSearchResultDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GlobalSearchQuery): Promise<GlobalSearchResultDto[]> {
    const q = query.q.trim();
    if (!q) return [];

    // Not `resolveWorkspaceForCaller` (bugbounty/authorization.util.ts) —
    // that helper's declared return type is narrowed to `{ id: string }`,
    // which would hide `organizationId` below. Same underlying repository
    // call, full `Workspace` type.
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const contains = { contains: q, mode: 'insensitive' as const };

    const [foundationResults, bugBountyResults, socResults, plugins, workflows, advisories] = await Promise.all([
      this.queryBus.execute<SearchQuery, SearchResultDto[]>(new SearchQuery(query.userId, q)),
      this.queryBus.execute<SearchBugBountyQuery, BugBountySearchResultDto[]>(
        new SearchBugBountyQuery(query.userId, q),
      ),
      // Module 17 — Global Search extension (task #483). Same
      // QueryBus.execute() composition as the two lines above.
      this.queryBus.execute<SearchSocQuery, SocSearchResultDto[]>(new SearchSocQuery(query.userId, q)),
      workspace.organizationId
        ? this.prisma.plugin.findMany({
            where: {
              organizationId: workspace.organizationId,
              status: { in: ['PUBLISHED', 'DEPRECATED'] },
              OR: [{ name: contains }, { description: contains }],
            },
            take: PER_TYPE_LIMIT,
          })
        : Promise.resolve([]),
      workspace.organizationId
        ? this.prisma.workflow.findMany({
            where: {
              OR: [{ organizationId: workspace.organizationId }, { workspaceId: workspace.id }],
              name: contains,
            },
            take: PER_TYPE_LIMIT,
          })
        : this.prisma.workflow.findMany({
            where: { workspaceId: workspace.id, name: contains },
            take: PER_TYPE_LIMIT,
          }),
      this.prisma.securityAdvisory.findMany({
        where: { OR: [{ title: contains }, { description: contains }] },
        take: PER_TYPE_LIMIT,
      }),
    ]);

    const results: GlobalSearchResultDto[] = [
      ...foundationResults.map((r): GlobalSearchResultDto => ({ ...r, type: r.type as GlobalSearchResultType })),
      ...bugBountyResults.map((r): GlobalSearchResultDto => ({ ...r, projectId: null, type: r.type as GlobalSearchResultType })),
      ...socResults.map((r): GlobalSearchResultDto => ({ ...r, projectId: null, type: r.type as GlobalSearchResultType })),
      ...plugins.map((p): GlobalSearchResultDto => ({
        type: 'PLUGIN',
        id: p.id,
        projectId: null,
        title: p.name,
        snippet: snippet(p.description),
      })),
      ...workflows.map((w): GlobalSearchResultDto => ({
        type: 'WORKFLOW',
        id: w.id,
        projectId: null,
        title: w.name,
        snippet: snippet(w.description),
      })),
      ...advisories.map((a): GlobalSearchResultDto => ({
        type: 'SECURITY_ADVISORY',
        id: a.id,
        projectId: null,
        title: a.title,
        snippet: snippet(a.description),
      })),
    ];

    return results;
  }
}
