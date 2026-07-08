import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../prisma/prisma-transaction.types.js';
import type { SearchResultDto } from '@pentesthub/shared';
import type { SearchService } from '../domain/search-service.interface.js';

const RESULTS_PER_TYPE = 10;
const SNIPPET_LENGTH = 160;

function snippet(text: string | null): string | null {
  if (!text) return null;
  return text.length > SNIPPET_LENGTH
    ? `${text.slice(0, SNIPPET_LENGTH)}…`
    : text;
}

/// Foundation implementation — case-insensitive `contains` across
/// Projects/Targets/Notes/Evidence, scoped to the caller's workspace by
/// joining through each row's project. Direct Prisma access here (not a
/// cross-module repository import) is the same "infrastructure layer
/// queries its own schema" reasoning used by Projects' own tag join —
/// search inherently cuts across content types.
@Injectable()
export class PrismaIlikeSearchService implements SearchService {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async search(workspaceId: string, query: string): Promise<SearchResultDto[]> {
    const contains = { contains: query, mode: 'insensitive' as const };

    const [projects, targets, notes, evidence] = await Promise.all([
      this.txHost.tx.project.findMany({
        where: { workspaceId, deletedAt: null, name: contains },
        take: RESULTS_PER_TYPE,
      }),
      this.txHost.tx.target.findMany({
        where: {
          deletedAt: null,
          project: { workspaceId },
          OR: [{ value: contains }, { name: contains }],
        },
        take: RESULTS_PER_TYPE,
      }),
      this.txHost.tx.note.findMany({
        where: {
          deletedAt: null,
          project: { workspaceId },
          OR: [{ title: contains }, { content: contains }],
        },
        take: RESULTS_PER_TYPE,
      }),
      this.txHost.tx.evidence.findMany({
        where: {
          deletedAt: null,
          project: { workspaceId },
          OR: [{ title: contains }, { description: contains }],
        },
        take: RESULTS_PER_TYPE,
      }),
    ]);

    return [
      ...projects.map((p): SearchResultDto => ({
        type: 'PROJECT',
        id: p.id,
        projectId: p.id,
        title: p.name,
        snippet: snippet(p.description),
      })),
      ...targets.map((t): SearchResultDto => ({
        type: 'TARGET',
        id: t.id,
        projectId: t.projectId,
        title: t.name ?? t.value,
        snippet: snippet(t.description),
      })),
      ...notes.map((n): SearchResultDto => ({
        type: 'NOTE',
        id: n.id,
        projectId: n.projectId,
        title: n.title ?? 'Untitled note',
        snippet: snippet(n.content),
      })),
      ...evidence.map((e): SearchResultDto => ({
        type: 'EVIDENCE',
        id: e.id,
        projectId: e.projectId,
        title: e.title,
        snippet: snippet(e.description),
      })),
    ];
  }
}
