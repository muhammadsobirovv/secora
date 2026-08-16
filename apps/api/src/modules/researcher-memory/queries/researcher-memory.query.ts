import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { ResearcherMemoryEntryDto, ResearcherMemoryKind } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ResearcherMemoryWorkspaceResolver } from '../researcher-memory-workspace.util.js';
import { toResearcherMemoryEntryDto } from '../mappers/to-researcher-memory-dto.mapper.js';

/// Every query here is scoped to `{ workspaceId, userId }` together, not
/// `workspaceId` alone — "user-level permissions" (spec) means a
/// teammate in the same workspace does not see another member's
/// researcher memory just by being a workspace member; only the entry's
/// own author can list/read/search/export/delete it.
export class ListResearcherMemoryEntriesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filters: { kind?: ResearcherMemoryKind; search?: string },
  ) {}
}

@QueryHandler(ListResearcherMemoryEntriesQuery)
export class ListResearcherMemoryEntriesHandler
  implements IQueryHandler<ListResearcherMemoryEntriesQuery, ResearcherMemoryEntryDto[]>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
  ) {}

  async execute(query: ListResearcherMemoryEntriesQuery): Promise<ResearcherMemoryEntryDto[]> {
    const workspaceId = await this.workspaceResolver.resolve(query.userId);

    const entries = await this.prisma.researcherMemoryEntry.findMany({
      where: {
        workspaceId,
        userId: query.userId,
        kind: query.filters.kind,
        // Simple substring search over title/content — "searchable"
        // (spec) doesn't require semantic search here; semantic recall
        // over memory is what AiMemoryService.search (RAG) is for, and
        // every entry is mirrored there on write. This is the direct
        // CRUD-list search a "My Memory" settings page needs.
        ...(query.filters.search
          ? {
              OR: [
                { title: { contains: query.filters.search, mode: 'insensitive' as const } },
                { content: { contains: query.filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    return entries.map(toResearcherMemoryEntryDto);
  }
}

export class GetResearcherMemoryEntryQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly entryId: string,
  ) {}
}

@QueryHandler(GetResearcherMemoryEntryQuery)
export class GetResearcherMemoryEntryHandler
  implements IQueryHandler<GetResearcherMemoryEntryQuery, ResearcherMemoryEntryDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
  ) {}

  async execute(query: GetResearcherMemoryEntryQuery): Promise<ResearcherMemoryEntryDto> {
    const workspaceId = await this.workspaceResolver.resolve(query.userId);
    const entry = await this.prisma.researcherMemoryEntry.findFirst({
      where: { id: query.entryId, userId: query.userId, workspaceId },
    });
    if (!entry) {
      throw new AppException('RESEARCHER_MEMORY_ENTRY_NOT_FOUND', 'Memory entry not found.', HttpStatus.NOT_FOUND);
    }
    return toResearcherMemoryEntryDto(entry);
  }
}

/// "Exportable" (spec) — a plain JSON array of every entry the caller
/// owns; deliberately no pagination limit above the same 500-row cap
/// `list` uses (a personal memory store realistically never approaches
/// that), so an export is always complete in one call.
export class ExportResearcherMemoryEntriesQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ExportResearcherMemoryEntriesQuery)
export class ExportResearcherMemoryEntriesHandler
  implements IQueryHandler<ExportResearcherMemoryEntriesQuery, ResearcherMemoryEntryDto[]>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
  ) {}

  async execute(query: ExportResearcherMemoryEntriesQuery): Promise<ResearcherMemoryEntryDto[]> {
    const workspaceId = await this.workspaceResolver.resolve(query.userId);
    const entries = await this.prisma.researcherMemoryEntry.findMany({
      where: { workspaceId, userId: query.userId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return entries.map(toResearcherMemoryEntryDto);
  }
}
