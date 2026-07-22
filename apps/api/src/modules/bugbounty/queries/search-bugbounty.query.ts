import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { BugBountySearchResultDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
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
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../../ai/domain/repositories/ai-conversations.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';

const PER_TYPE_LIMIT = 10;
const MAX_TAG_SOURCE_ROWS = 500;

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
///
/// Module 9 additions (AI_CHAT/TAG/TASK) reuse existing repositories where
/// one already exists (AiConversationsRepository) and fall back to
/// PrismaService directly for the other two: TaskItem has no repository
/// interface of its own yet (Collaboration's ListTaskItemsHandler is the
/// only other caller and also goes straight through PrismaService — same
/// documented Module 9 deviation), and "tag" isn't an entity at all, just
/// a `tags: string[]` column shared across Program/Finding/Payload/Note —
/// there's nothing to put a repository interface in front of.
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
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    private readonly prisma: PrismaService,
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

    const [
      programs,
      findings,
      reports,
      payloads,
      notes,
      conversations,
      tasks,
      tagSourceRows,
    ] = await Promise.all([
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
      this.conversationsRepository.list({
        workspaceId: workspace.id,
        search: q,
        limit: PER_TYPE_LIMIT,
      }),
      this.prisma.taskItem.findMany({
        where: {
          workspaceId: workspace.id,
          deletedAt: null,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: PER_TYPE_LIMIT,
        orderBy: { updatedAt: 'desc' },
      }),
      collectTagSourceRows(this.prisma, workspace.id),
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
        snippet: snippet(n.contentMarkdown),
      })),
      ...conversations.slice(0, PER_TYPE_LIMIT).map((c) => ({
        type: 'AI_CHAT' as const,
        id: c.id,
        title: c.title ?? 'Untitled conversation',
        snippet: snippet(c.lastMessagePreview),
      })),
      ...tasks.slice(0, PER_TYPE_LIMIT).map((t) => ({
        type: 'TASK' as const,
        id: t.id,
        title: t.title,
        snippet: snippet(t.description),
      })),
      ...matchingTags(tagSourceRows, q).map((tag) => ({
        type: 'TAG' as const,
        // Tags aren't rows with their own id — the tag string itself is
        // the only stable identifier a client can filter by (e.g. "list
        // everything tagged X"), so it doubles as `id` here.
        id: tag,
        title: tag,
        snippet: null,
      })),
    ];

    return results;
  }
}

/// One unfiltered (workspace-scoped, capped) fetch per tag-bearing table —
/// there's no cheap way to ask Postgres "which array elements match this
/// substring" through Prisma's query builder without raw SQL, and at this
/// module's expected row counts an in-memory scan is simpler and fast
/// enough (same tradeoff as the rest of this handler).
async function collectTagSourceRows(
  prisma: PrismaService,
  workspaceId: string,
): Promise<string[][]> {
  const [programs, findings, payloads, notes] = await Promise.all([
    prisma.bugBountyProgram.findMany({
      where: { workspaceId, deletedAt: null },
      select: { tags: true },
      take: MAX_TAG_SOURCE_ROWS,
    }),
    prisma.bugBountyFinding.findMany({
      where: { workspaceId, deletedAt: null },
      select: { tags: true },
      take: MAX_TAG_SOURCE_ROWS,
    }),
    prisma.payloadLibraryEntry.findMany({
      // Include global seed entries (workspaceId: null) alongside this
      // workspace's own — same OR PrismaPayloadLibraryRepository.list()
      // uses, so tag search doesn't miss tags that only exist on seeds.
      where: {
        OR: [{ workspaceId }, { workspaceId: null }],
        deletedAt: null,
      },
      select: { tags: true },
      take: MAX_TAG_SOURCE_ROWS,
    }),
    prisma.knowledgeBaseNote.findMany({
      where: { workspaceId, deletedAt: null },
      select: { tags: true },
      take: MAX_TAG_SOURCE_ROWS,
    }),
  ]);
  return [...programs, ...findings, ...payloads, ...notes].map(
    (row) => row.tags,
  );
}

function matchingTags(tagArrays: string[][], q: string): string[] {
  const needle = q.toLowerCase();
  const matched = new Set<string>();
  for (const tags of tagArrays) {
    for (const tag of tags) {
      if (tag.toLowerCase().includes(needle)) matched.add(tag);
    }
  }
  return [...matched].slice(0, PER_TYPE_LIMIT);
}
