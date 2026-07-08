import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateWorkspaceInput,
  WorkspacesRepository,
} from '../../../domain/repositories/workspaces.repository.interface.js';
import type {
  Workspace,
  WorkspaceMemberRole,
} from '../../../../../prisma-types.js';

@Injectable()
export class PrismaWorkspacesRepository implements WorkspacesRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateWorkspaceInput): Promise<Workspace> {
    return this.txHost.tx.workspace.create({ data: input });
  }

  async addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceMemberRole,
  ): Promise<void> {
    await this.txHost.tx.workspaceMember.create({
      data: { workspaceId, userId, role },
    });
  }

  findById(id: string): Promise<Workspace | null> {
    return this.txHost.tx.workspace.findUnique({ where: { id } });
  }

  async findPersonalWorkspaceForUser(
    userId: string,
  ): Promise<Workspace | null> {
    const membership = await this.txHost.tx.workspaceMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      include: { workspace: true },
    });
    return membership?.workspace ?? null;
  }

  update(
    id: string,
    data: Partial<Pick<Workspace, 'name' | 'description' | 'avatarUrl'>>,
  ): Promise<Workspace> {
    return this.txHost.tx.workspace.update({ where: { id }, data });
  }

  async listMembers(
    workspaceId: string,
  ): Promise<
    Array<{ userId: string; role: WorkspaceMemberRole; joinedAt: Date }>
  > {
    const members = await this.txHost.tx.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true, role: true, joinedAt: true },
      orderBy: { joinedAt: 'asc' },
    });
    return members;
  }

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const found = await this.txHost.tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    return found !== null;
  }
}
