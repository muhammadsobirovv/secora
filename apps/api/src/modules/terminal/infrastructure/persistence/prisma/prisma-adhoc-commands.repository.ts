import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  AdHocCommandsRepository,
  CreateAdHocCommandInput,
  ListAdHocCommandsFilter,
  UpdateAdHocCommandInput,
} from '../../../domain/repositories/adhoc-commands.repository.interface.js';
import type { AdHocCommand } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaAdHocCommandsRepository implements AdHocCommandsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateAdHocCommandInput): Promise<AdHocCommand> {
    return this.txHost.tx.adHocCommand.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        targetId: input.targetId,
        tool: input.tool,
        kind: input.kind,
        argsSummary: input.argsSummary,
        classification: input.classification,
        status: input.status as never,
        approvalRequestId: input.approvalRequestId ?? null,
        rejectionReason: input.rejectionReason ?? null,
        requestedBy: input.requestedBy,
        source: input.source,
        researchSessionId: input.researchSessionId ?? null,
      },
    });
  }

  findById(id: string): Promise<AdHocCommand | null> {
    return this.txHost.tx.adHocCommand.findUnique({ where: { id } });
  }

  findByIdForCaller(id: string, workspaceId: string, requestedBy: string): Promise<AdHocCommand | null> {
    return this.txHost.tx.adHocCommand.findFirst({
      where: { id, workspaceId, requestedBy },
    });
  }

  update(id: string, input: UpdateAdHocCommandInput): Promise<AdHocCommand> {
    return this.txHost.tx.adHocCommand.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status as never } : {}),
        ...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
        ...(input.stdout !== undefined ? { stdout: input.stdout } : {}),
        ...(input.stderr !== undefined ? { stderr: input.stderr } : {}),
        ...(input.rejectionReason !== undefined ? { rejectionReason: input.rejectionReason } : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
        ...(input.finishedAt !== undefined ? { finishedAt: input.finishedAt } : {}),
        ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      },
    });
  }

  list(filter: ListAdHocCommandsFilter): Promise<AdHocCommand[]> {
    return this.txHost.tx.adHocCommand.findMany({
      where: {
        workspaceId: filter.workspaceId,
        requestedBy: filter.requestedBy,
        ...(filter.targetId ? { targetId: filter.targetId } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: filter.limit ?? 100,
    });
  }
}
