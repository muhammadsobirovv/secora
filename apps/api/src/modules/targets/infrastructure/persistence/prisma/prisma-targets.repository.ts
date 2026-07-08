import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateTargetInput,
  ListTargetsFilter,
  TargetsRepository,
  TargetWithTags,
  UpdateTargetInput,
} from '../../../domain/repositories/targets.repository.interface.js';
import type { Target } from '../../../../../prisma-types.js';

const WITH_TAGS = { tags: { include: { tag: true } } } as const;

function flattenTags(
  target: Target & { tags: { tag: unknown }[] },
): TargetWithTags {
  const { tags, ...rest } = target;
  return { ...rest, tags: tags.map((t) => t.tag) } as TargetWithTags;
}

@Injectable()
export class PrismaTargetsRepository implements TargetsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateTargetInput): Promise<Target> {
    return this.txHost.tx.target.create({ data: input });
  }

  async findById(id: string): Promise<TargetWithTags | null> {
    const target = await this.txHost.tx.target.findFirst({
      where: { id, deletedAt: null },
      include: WITH_TAGS,
    });
    return target ? flattenTags(target) : null;
  }

  async findByIdForProject(
    id: string,
    projectId: string,
  ): Promise<TargetWithTags | null> {
    const target = await this.txHost.tx.target.findFirst({
      where: { id, projectId, deletedAt: null },
      include: WITH_TAGS,
    });
    return target ? flattenTags(target) : null;
  }

  update(id: string, data: UpdateTargetInput): Promise<Target> {
    return this.txHost.tx.target.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<Target> {
    return this.txHost.tx.target.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async list(filter: ListTargetsFilter): Promise<TargetWithTags[]> {
    const targets = await this.txHost.tx.target.findMany({
      where: {
        projectId: filter.projectId,
        deletedAt: null,
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.scopeStatus ? { scopeStatus: filter.scopeStatus } : {}),
        ...(filter.tagId ? { tags: { some: { tagId: filter.tagId } } } : {}),
      },
      include: WITH_TAGS,
      orderBy: { createdAt: 'desc' },
    });
    return targets.map(flattenTags);
  }
}
