import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreatePlaybookInput,
  CreatePlaybookVersionInput,
  ListPlaybooksFilter,
  PlaybooksRepository,
  PublishPlaybookVersionInput,
  UpdatePlaybookInput,
} from '../../../domain/repositories/playbooks.repository.interface.js';
import type { Playbook, PlaybookVersion } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaPlaybooksRepository implements PlaybooksRepository {
  constructor(private readonly txHost: TransactionHost<AppTransactionalAdapter>) {}

  create(input: CreatePlaybookInput): Promise<Playbook> {
    return this.txHost.tx.playbook.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        isBuiltIn: input.isBuiltIn ?? false,
        createdBy: input.createdBy,
      },
    });
  }

  findById(id: string): Promise<Playbook | null> {
    return this.txHost.tx.playbook.findUnique({ where: { id } });
  }

  findByIdForWorkspace(id: string, workspaceId: string): Promise<Playbook | null> {
    return this.txHost.tx.playbook.findFirst({ where: { id, workspaceId } });
  }

  list(filter: ListPlaybooksFilter): Promise<Playbook[]> {
    return this.txHost.tx.playbook.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(filter.category ? { category: filter.category } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  update(id: string, input: UpdatePlaybookInput): Promise<Playbook> {
    return this.txHost.tx.playbook.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.status !== undefined ? { status: input.status as never } : {}),
        ...(input.currentVersionId !== undefined ? { currentVersionId: input.currentVersionId } : {}),
        ...(input.archivedAt !== undefined ? { archivedAt: input.archivedAt } : {}),
      },
    });
  }

  createVersion(input: CreatePlaybookVersionInput): Promise<PlaybookVersion> {
    return this.txHost.tx.playbookVersion.create({
      data: {
        playbookId: input.playbookId,
        version: input.version,
        graph: input.graph as never,
        variables: input.variables as never,
        createdBy: input.createdBy,
      },
    });
  }

  findVersionById(id: string): Promise<PlaybookVersion | null> {
    return this.txHost.tx.playbookVersion.findUnique({ where: { id } });
  }

  findLatestVersion(playbookId: string): Promise<PlaybookVersion | null> {
    return this.txHost.tx.playbookVersion.findFirst({
      where: { playbookId },
      orderBy: [{ version: 'desc' }],
    });
  }

  publishVersion(id: string, input: PublishPlaybookVersionInput): Promise<PlaybookVersion> {
    return this.txHost.tx.playbookVersion.update({
      where: { id },
      data: { publishedAt: new Date(), publishedBy: input.publishedBy },
    });
  }
}
