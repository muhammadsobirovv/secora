import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateTagInput,
  TagsRepository,
} from '../../../domain/repositories/tags.repository.interface.js';
import type { Tag } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaTagsRepository implements TagsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateTagInput): Promise<Tag> {
    return this.txHost.tx.tag.create({ data: input });
  }

  findById(id: string): Promise<Tag | null> {
    return this.txHost.tx.tag.findUnique({ where: { id } });
  }

  findByWorkspaceAndName(
    workspaceId: string,
    name: string,
  ): Promise<Tag | null> {
    return this.txHost.tx.tag.findUnique({
      where: { workspaceId_name: { workspaceId, name } },
    });
  }

  list(workspaceId: string): Promise<Tag[]> {
    return this.txHost.tx.tag.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx.tag.delete({ where: { id } });
  }

  async tagProject(projectId: string, tagId: string): Promise<void> {
    await this.txHost.tx.projectTag.upsert({
      where: { projectId_tagId: { projectId, tagId } },
      update: {},
      create: { projectId, tagId },
    });
  }

  async untagProject(projectId: string, tagId: string): Promise<void> {
    await this.txHost.tx.projectTag.deleteMany({ where: { projectId, tagId } });
  }

  async tagTarget(targetId: string, tagId: string): Promise<void> {
    await this.txHost.tx.targetTag.upsert({
      where: { targetId_tagId: { targetId, tagId } },
      update: {},
      create: { targetId, tagId },
    });
  }

  async untagTarget(targetId: string, tagId: string): Promise<void> {
    await this.txHost.tx.targetTag.deleteMany({ where: { targetId, tagId } });
  }
}
