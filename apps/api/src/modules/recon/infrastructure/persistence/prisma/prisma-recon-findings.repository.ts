import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  ListReconFindingsFilter,
  ReconFindingsRepository,
  UpsertFindingInput,
} from '../../../domain/repositories/recon-findings.repository.interface.js';
import type { ReconFinding, Prisma } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaReconFindingsRepository implements ReconFindingsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  /// Prisma has no batch upsert primitive, so this is one upsert per
  /// finding, run concurrently via Promise.all — NOT wrapped in its own
  /// this.txHost.tx.$transaction(...) batch. That would be wrong: this
  /// method is always called from within ReconJobExecutionService's own
  /// @Transactional() persistToolResult(), so this.txHost.tx already
  /// resolves to the ambient transaction's client, and calling
  /// .$transaction() on a client that IS a transaction (rather than the
  /// top-level client) is invalid — it silently stalls until Prisma's
  /// interactive-transaction timeout fires, observed live as every write
  /// after it in the same transaction failing with "query cannot be
  /// executed on an expired transaction." Each upsert() call below still
  /// correctly participates in the ambient transaction on its own.
  upsertMany(findings: UpsertFindingInput[]): Promise<ReconFinding[]> {
    return Promise.all(
      findings.map((finding) =>
        this.txHost.tx.reconFinding.upsert({
          where: {
            targetId_type_dedupKey: {
              targetId: finding.targetId,
              type: finding.type,
              dedupKey: finding.dedupKey,
            },
          },
          create: {
            jobId: finding.jobId,
            workspaceId: finding.workspaceId,
            projectId: finding.projectId,
            targetId: finding.targetId,
            type: finding.type,
            value: finding.value,
            data: finding.data as Prisma.InputJsonValue,
            source: finding.source,
            dedupKey: finding.dedupKey,
          },
          update: {
            jobId: finding.jobId,
            value: finding.value,
            data: finding.data as Prisma.InputJsonValue,
            source: finding.source,
            lastSeenAt: new Date(),
          },
        }),
      ),
    );
  }

  findById(id: string): Promise<ReconFinding | null> {
    return this.txHost.tx.reconFinding.findUnique({ where: { id } });
  }

  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<ReconFinding | null> {
    return this.txHost.tx.reconFinding.findFirst({
      where: { id, workspaceId },
    });
  }

  list(filter: ListReconFindingsFilter): Promise<ReconFinding[]> {
    return this.txHost.tx.reconFinding.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.targetId ? { targetId: filter.targetId } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.jobId ? { jobId: filter.jobId } : {}),
        ...(filter.type ? { type: filter.type } : {}),
      },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  markPromoted(id: string, targetId: string): Promise<ReconFinding> {
    return this.txHost.tx.reconFinding.update({
      where: { id },
      data: { promotedTargetId: targetId },
    });
  }
}
