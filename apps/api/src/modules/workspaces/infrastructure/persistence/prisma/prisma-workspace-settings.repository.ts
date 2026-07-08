import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type { WorkspaceSettingsRepository } from '../../../domain/repositories/workspace-settings.repository.interface.js';
import type {
  ProjectStatus,
  WorkspaceSettings,
} from '../../../../../prisma-types.js';

@Injectable()
export class PrismaWorkspaceSettingsRepository implements WorkspaceSettingsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  findByWorkspaceId(workspaceId: string): Promise<WorkspaceSettings | null> {
    return this.txHost.tx.workspaceSettings.findUnique({
      where: { workspaceId },
    });
  }

  createDefault(workspaceId: string): Promise<WorkspaceSettings> {
    return this.txHost.tx.workspaceSettings.create({ data: { workspaceId } });
  }

  update(
    workspaceId: string,
    data: Partial<{ defaultProjectStatus: ProjectStatus }>,
  ): Promise<WorkspaceSettings> {
    return this.txHost.tx.workspaceSettings.update({
      where: { workspaceId },
      data,
    });
  }
}
