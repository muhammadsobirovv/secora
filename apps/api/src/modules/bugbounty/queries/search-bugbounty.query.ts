import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { BugBountySearchResultDto } from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import {
  BUG_REPORTS_REPOSITORY,
  type BugReportsRepository,
} from '../domain/repositories/bug-reports.repository.interface.js';
import {
  PAYLOAD_LIBRARY_REPOSITORY,
  type PayloadLibraryRepository,
} from '../domain/repositories/payload-library.repository.interface.js';
import {
  KNOWLEDGE_BASE_REPOSITORY,
  type KnowledgeBaseRepository,
} from '../domain/repositories/knowledge-base.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';

const PER_TYPE_LIMIT = 10;

function snippet(text: string | null | undefined, length = 140): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > length ? `${trimmed.slice(0, length)}…` : trimmed;
}

export class SearchBugBountyQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly q: string,
  ) {}
}

/// Fans out to every Module 6 entity's own `search` filter rather than a
/// dedicated search index table — reasonable at this module's data
/// volume (see the Statistics query's similar "list() cap, not a SQL
/// aggregate" tradeoff); a true full-text index across entity types would
/// be a follow-up, not a blocker for this feature.
@QueryHandler(SearchBugBountyQuery)
export class SearchBugBountyHandler implements IQueryHandler<
  SearchBugBountyQuery,
  BugBountySearchResultDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
    @Inject(PAYLOAD_LIBRARY_REPOSITORY)
    private readonly payloadLibraryRepository: PayloadLibraryRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly notesRepository: KnowledgeBaseRepository,
  ) {}

  async execute(
    query: SearchBugBountyQuery,
  ): Promise<BugBountySearchResultDto[]> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );
    const q = query.q.trim();
    if (!q) return [];

    const [programs, findings, reports, payloads, notes] = await Promise.all([
      this.programsRepository.list({ workspaceId: workspace.id, search: q }),
      this.findingsRepository.list({
        workspaceId: workspace.id,
        search: q,
        limit: PER_TYPE_LIMIT,
      }),
      this.reportsRepository.list({ workspaceId: workspace.id, search: q }),
      this.payloadLibraryRepository.list({
        workspaceId: workspace.id,
        search: q,
      }),
      this.notesRepository.list({ workspaceId: workspace.id, search: q }),
    ]);

    const results: BugBountySearchResultDto[] = [
      ...programs.slice(0, PER_TYPE_LIMIT).map((p) => ({
        type: 'PROGRAM' as const,
        id: p.id,
        title: p.name,
        snippet: snippet(p.organization ?? p.platform),
      })),
      ...findings.slice(0, PER_TYPE_LIMIT).map((f) => ({
        type: 'BUGBOUNTY_FINDING' as const,
        id: f.id,
        title: f.title,
        snippet: snippet(f.description),
      })),
      ...reports.slice(0, PER_TYPE_LIMIT).map((r) => ({
        type: 'BUG_REPORT' as const,
        id: r.id,
        title: r.title,
        snippet: snippet(r.summary),
      })),
      ...payloads.slice(0, PER_TYPE_LIMIT).map((p) => ({
        type: 'PAYLOAD' as const,
        id: p.id,
        title: p.title,
        snippet: snippet(p.description),
      })),
      ...notes.slice(0, PER_TYPE_LIMIT).map((n) => ({
        type: 'KNOWLEDGE_BASE_NOTE' as const,
        id: n.id,
        title: n.title ?? 'Untitled note',
        snippet: snippe