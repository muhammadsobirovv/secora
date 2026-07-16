import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  BugBountyProgramsRepository,
  CreateBugBountyProgramInput,
  CreateScopeItemInput,
  ListBugBountyProgramsFilter,
  UpdateBugBountyProgramInput,
  UpdateScopeItemInput,
} from '../../../domain/repositories/bugbounty-programs.repository.interface.js';
import type {
  BugBountyProgram,
  BugBountyProgramScopeItem,
  BugBountyProgramTarget,
  Prisma,
} from '../../../../../prisma-types.js';

@Injectable()
export class PrismaBugBountyProgramsRepository implements BugBountyProgramsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateBugBountyProgramInput): Promise<BugBountyProgram> {
    return this.txHost.tx.bugBountyProgram.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        name: input.name,
        platform: input.platform,
        organization: input.organization ?? null,
        url: input.url ?? null,
        status: input.status ?? 'ACTIVE',
        rulesMarkdown: input.rulesMarkdown ?? null,
        ...(input.bountyTable !== undefined
          ? { bountyTable: input.bountyTable as Prisma.InputJsonValue }
          : {}),
        ...(input.severityMatrix !== undefined
          ? { severityMatrix: input.severityMatrix as Prisma.InputJsonValue }
          : {}),
        disclosurePolicy: input.disclosurePolicy ?? null,
        notesMarkdown: input.notesMarkdown ?? null,
        tags: input.tags ?? [],
        createdBy: input.createdBy,
      },
    });
  }

  findById(id: string): Promise<BugBountyProgram | null> {
    return this.txHost.tx.bugBountyProgram.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<BugBountyProgram | null> {
    return this.txHost.tx.bugBountyProgram.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
  }

  list(filter: ListBugBountyProgramsFilter): Promise<BugBountyProgram[]> {
    return this.txHost.tx.bugBountyProgram.findMany({
      where: {
        workspaceId: filter.workspaceId,
        deletedAt: null,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.platform ? { platform: filter.platform } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.search
          ? { name: { contains: filter.search, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(
    id: string,
    input: UpdateBugBountyProgramInput,
  ): Promise<BugBountyProgram> {
    return this.txHost.tx.bugBountyProgram.update({
      where: { id },
      data: {
        ...(input.projectId !== undefined
          ? { projectId: input.projectId }
          : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.platform !== undefined ? { platform: input.platform } : {}),
        ...(input.organization !== undefined
          ? { organization: input.organization }
          : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.rulesMarkdown !== undefined
          ? { rulesMarkdown: input.rulesMarkdown }
          : {}),
        ...(input.bountyTable !== undefined
          ? { bountyTable: input.bountyTable as Prisma.InputJsonValue }
          : {}),
        ...(input.severityMatrix !== undefined
          ? { severityMatrix: input.severityMatrix as Prisma.InputJsonValue }
          : {}),
        ...(input.disclosurePolicy !== undefined
          ? { disclosurePolicy: input.disclosurePolicy }
          : {}),
        ...(input.notesMarkdown !== undefined
          ? { notesMarkdown: input.notesMarkdown }
          : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.txHost.tx.bugBountyProgram.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  addScopeItem(
    input: CreateScopeItemInput,
  ): Promise<BugBountyProgramScopeItem> {
    return this.txHost.tx.bugBountyProgramScopeItem.create({
      data: {
        programId: input.programId,
        type: input.type,
        pattern: input.pattern,
        classification: input.classification ?? 'UNKNOWN',
        notes: input.notes ?? null,
      },
    });
  }

  updateScopeItem(
    id: string,
    input: UpdateScopeItemInput,
  ): Promise<BugBountyProgramScopeItem> {
    return this.txHost.tx.bugBountyProgramScopeItem.update({
      where: { id },
      data: {
        ...(input.classification !== undefined
          ? { classification: input.classification }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
  }

  async removeScopeItem(id: string): Promise<void> {
    await this.txHost.tx.bugBountyProgramScopeItem.delete({ where: { id } });
  }

  listScopeItems(programId: string): Promise<BugBountyProgramScopeItem[]> {
    return this.txHost.tx.bugBountyProgramScopeItem.findMany({
      where: { programId },
      orderBy: { createdAt: 'asc' },
    });
  }

  findScopeItemById(id: string): Promise<BugBountyProgramScopeItem | null> {
    return this.txHost.tx.bugBountyProgramScopeItem.findUnique({
      where: { id },
    });
  }

  linkTarget(
    programId: string,
    targetId: string,
  ): Promise<BugBountyProgramTarget> {
    return this.txHost.tx.bugBountyProgramTarget.upsert({
      where: { programId_targetId: { programId, targetId } },
      create: { programId, targetId },
      update: {},
    });
  }

  async unlinkTarget(programId: string, targetId: string): Promise<void> {
    await this.txHost.tx.bugBountyProgramTarget.deleteMany({
      where: { programId, targetId },
    });
  }

  async listLinkedTargetIds(programId: string): Promise<string[]> {
    const links = await this.txHost.tx.bugBountyProgramTarget.findMany({
      where: { programId },
      select: { targetId: true },
    });
    return links.map((l) => l.targetId);
  }

  async listProgramIdsForTarget(targetId: string): Promise<string[]> {
    const links = await this.txHost.tx.bugBountyProgramTarget.findMany({
      where: { targetId },
      select: { programId: true },
    });
    return links.map((l) => l.programId);
  }

  countScopeItems(programId: string): Promise<number> {
    return this.txHost.tx.bugBountyProgramScopeItem.count({
      where: { programId },
    });
  }

  countLinkedTargets(programId: string): Promise<number> {
    return this.txHost.tx.bugBountyProgramTarg