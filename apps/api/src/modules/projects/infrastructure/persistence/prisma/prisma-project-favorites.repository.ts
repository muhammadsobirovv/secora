import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type { ProjectFavoritesRepository } from '../../../domain/repositories/project-favorites.repository.interface.js';

@Injectable()
export class PrismaProjectFavoritesRepository implements ProjectFavoritesRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async add(projectId: string, userId: string): Promise<void> {
    await this.txHost.tx.projectFavorite.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: {},
      create: { projectId, userId },
    });
  }

  async remove(projectId: string, userId: string): Promise<void> {
    await this.txHost.tx.projectFavorite.deleteMany({
      where: { projectId, userId },
    });
  }

  async isFavorite(projectId: string, userId: string): Promise<boolean> {
    const found = await this.txHost.tx.projectFavorite.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return found !== null;
  }

  async listFavoritedIds(
    projectIds: string[],
    userId: string,
  ): Promise<Set<string>> {
    if (projectIds.length === 0) return new Set();
    const favorites = await this.txHost.tx.projectFavorite.findMany({
      where: { userId, projectId: { in: projectIds } },
      select: { projectId: true },
    });
    return new Set(favorites.map((f) => f.projectId));
  }
}
