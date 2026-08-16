import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type {
  AuditEventType,
  ResearcherMemoryKind as PrismaResearcherMemoryKind,
} from '../../../prisma-types.js';
import type {
  CreateResearcherMemoryEntryRequestDto,
  ResearcherMemoryEntryDto,
  UpdateResearcherMemoryEntryRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AiMemoryService } from '../../ai/memory/ai-memory.service.js';
import { ResearcherMemoryWorkspaceResolver } from '../researcher-memory-workspace.util.js';
import { toResearcherMemoryEntryDto } from '../mappers/to-researcher-memory-dto.mapper.js';

/// "Audit important memory mutations" (spec) — only IMPORTANT_FINDING and
/// DECISION kinds write an AI_MEMORY_ENTRY_MUTATED audit row; the other
/// four kinds (PREFERENCE/PROJECT_CONTEXT/NOTE/CUSTOM_INSTRUCTION) are
/// lower-stakes personal notes and would just add audit-log noise. See
/// the AuditEventType enum's doc comment in schema.prisma.
const AUDITED_KINDS = new Set<PrismaResearcherMemoryKind>(['IMPORTANT_FINDING', 'DECISION']);

async function findOwnedEntry(
  prisma: PrismaService,
  id: string,
  userId: string,
  workspaceId: string,
) {
  const entry = await prisma.researcherMemoryEntry.findFirst({
    where: { id, userId, workspaceId },
  });
  if (!entry) {
    throw new AppException('RESEARCHER_MEMORY_ENTRY_NOT_FOUND', 'Memory entry not found.', HttpStatus.NOT_FOUND);
  }
  return entry;
}

async function recordAuditIfImportant(
  prisma: PrismaService,
  userId: string,
  entryId: string,
  workspaceId: string,
  kind: PrismaResearcherMemoryKind,
  action: 'created' | 'updated' | 'deleted',
): Promise<void> {
  if (!AUDITED_KINDS.has(kind)) return;
  const type: AuditEventType = 'AI_MEMORY_ENTRY_MUTATED';
  await prisma.auditEvent.create({
    data: { userId, type, ipAddress: '0.0.0.0', userAgent: 'api', metadata: { entryId, workspaceId, kind, action } },
  });
}

export class CreateResearcherMemoryEntryCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateResearcherMemoryEntryRequestDto,
  ) {}
}

@CommandHandler(CreateResearcherMemoryEntryCommand)
export class CreateResearcherMemoryEntryHandler
  implements ICommandHandler<CreateResearcherMemoryEntryCommand, ResearcherMemoryEntryDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
    private readonly aiMemory: AiMemoryService,
  ) {}

  async execute(command: CreateResearcherMemoryEntryCommand): Promise<ResearcherMemoryEntryDto> {
    const workspaceId = await this.workspaceResolver.resolve(command.userId);

    const entry = await this.prisma.researcherMemoryEntry.create({
      data: {
        workspaceId,
        userId: command.userId,
        kind: command.data.kind,
        title: command.data.title,
        content: command.data.content,
        tags: command.data.tags ?? [],
      },
    });

    // Mirror into the existing AiMemoryChunk RAG store (sourceType
    // RESEARCHER_MEMORY) — see ResearcherMemoryEntry's own doc comment
    // in schema.prisma and the "AI Memory ... integrate with existing
    // AI/RAG architecture, do not build a second one" constraint.
    // Best-effort: indexContent already no-ops quietly if no embedding
    // provider is configured (Community Edition without BYOK) — a
    // researcher's ability to save/read their own memory entries never
    // depends on RAG/embeddings being configured.
    await this.aiMemory.indexContent({
      workspaceId,
      projectId: null,
      sourceType: 'RESEARCHER_MEMORY',
      sourceId: entry.id,
      content: `${entry.title}\n\n${entry.content}`,
      metadata: { kind: entry.kind, userId: command.userId, tags: entry.tags },
    });

    await recordAuditIfImportant(this.prisma, command.userId, entry.id, workspaceId, entry.kind, 'created');

    return toResearcherMemoryEntryDto(entry);
  }
}

export class UpdateResearcherMemoryEntryCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly entryId: string,
    public readonly data: UpdateResearcherMemoryEntryRequestDto,
  ) {}
}

@CommandHandler(UpdateResearcherMemoryEntryCommand)
export class UpdateResearcherMemoryEntryHandler
  implements ICommandHandler<UpdateResearcherMemoryEntryCommand, ResearcherMemoryEntryDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
    private readonly aiMemory: AiMemoryService,
  ) {}

  async execute(command: UpdateResearcherMemoryEntryCommand): Promise<ResearcherMemoryEntryDto> {
    const workspaceId = await this.workspaceResolver.resolve(command.userId);
    const existing = await findOwnedEntry(this.prisma, command.entryId, command.userId, workspaceId);

    const updated = await this.prisma.researcherMemoryEntry.update({
      where: { id: existing.id },
      data: {
        title: command.data.title ?? undefined,
        content: command.data.content ?? undefined,
        tags: command.data.tags ?? undefined,
      },
    });

    await this.aiMemory.indexContent({
      workspaceId,
      projectId: null,
      sourceType: 'RESEARCHER_MEMORY',
      sourceId: updated.id,
      content: `${updated.title}\n\n${updated.content}`,
      metadata: { kind: updated.kind, userId: command.userId, tags: updated.tags },
    });

    await recordAuditIfImportant(this.prisma, command.userId, updated.id, workspaceId, updated.kind, 'updated');

    return toResearcherMemoryEntryDto(updated);
  }
}

/// Explicit deletion (spec: "explicit deletion, no silent persistence of
/// sensitive information") — removes both the CRUD row *and* its mirrored
/// RAG chunks in the same call, so a deleted memory can never still
/// surface through semantic search after the user asked to remove it.
export class DeleteResearcherMemoryEntryCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly entryId: string,
  ) {}
}

@CommandHandler(DeleteResearcherMemoryEntryCommand)
export class DeleteResearcherMemoryEntryHandler implements ICommandHandler<DeleteResearcherMemoryEntryCommand, void> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
    private readonly aiMemory: AiMemoryService,
  ) {}

  async execute(command: DeleteResearcherMemoryEntryCommand): Promise<void> {
    const workspaceId = await this.workspaceResolver.resolve(command.userId);
    const existing = await findOwnedEntry(this.prisma, command.entryId, command.userId, workspaceId);

    await this.prisma.researcherMemoryEntry.delete({ where: { id: existing.id } });
    await this.aiMemory.deindexContent('RESEARCHER_MEMORY', existing.id);

    await recordAuditIfImportant(this.prisma, command.userId, existing.id, workspaceId, existing.kind, 'deleted');
  }
}
