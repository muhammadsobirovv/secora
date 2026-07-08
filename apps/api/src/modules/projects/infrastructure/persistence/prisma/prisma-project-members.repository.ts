import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type { ProjectMembersRepository } from '../../../domain/repositories/project-members.repository.interface.js';
import type {
  ProjectMember,
  ProjectMemberRole,
} from '../../../../../prisma-types.js';

@Injectable()
export class PrismaProjectMembersRepository implements ProjectMembersRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  add(
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
  ): Promise<ProjectMember> {
    return this.txHost.tx.projectMember.create({
      data: { projectId, userId, role },
    });
  }

  async remove(projectId: string, userId: string): Promise<void> {
    await this.txHost.tx.projectMember.deleteMany({
      where: { projectId, userId },
    });
  }

  findByProjectAndUser(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | null> {
    return this.txHost.tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  list(projectId: string): Promise<ProjectMember[]> {
    return this.txHost.tx.projectMember.findMany({
      where: { projectId },
      orderBy: { addedAt: 'asc' },
    });
  }
}
