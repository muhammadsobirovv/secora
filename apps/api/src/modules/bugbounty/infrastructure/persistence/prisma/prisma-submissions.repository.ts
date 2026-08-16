import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateRewardLedgerEntryInput,
  CreateSubmissionInput,
  ListSubmissionsFilter,
  SubmissionAnalyticsProjection,
  SubmissionsRepository,
  UpdateSubmissionStatusInput,
} from '../../../domain/repositories/submissions.repository.interface.js';
import type { RewardLedgerEntry, Submission } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaSubmissionsRepository implements SubmissionsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateSubmissionInput): Promise<Submission> {
    return this.txHost.tx.submission.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        programId: input.programId,
        findingId: input.findingId,
        bugReportId: input.bugReportId ?? null,
        title: input.title,
        severity: input.severity,
        platform: input.platform,
        externalId: input.externalId ?? null,
        externalUrl: input.externalUrl ?? null,
        notes: input.notes ?? null,
        createdBy: input.createdBy,
      },
    });
  }

  findById(id: string): Promise<Submission | null> {
    return this.txHost.tx.submission.findUnique({ where: { id } });
  }

  findByIdForWorkspace(id: string, workspaceId: string): Promise<Submission | null> {
    return this.txHost.tx.submission.findFirst({ where: { id, workspaceId } });
  }

  list(filter: ListSubmissionsFilter): Promise<Submission[]> {
    return this.txHost.tx.submission.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.programId ? { programId: filter.programId } : {}),
        ...(filter.findingId ? { findingId: filter.findingId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: filter.limit ?? 200,
    });
  }

  updateStatus(id: string, input: UpdateSubmissionStatusInput): Promise<Submission> {
    return this.txHost.tx.submission.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
        ...(input.responseAt !== undefined ? { responseAt: input.responseAt } : {}),
        ...(input.reward !== undefined ? { reward: input.reward } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
  }

  createRewardLedgerEntry(input: CreateRewardLedgerEntryInput): Promise<RewardLedgerEntry> {
    return this.txHost.tx.rewardLedgerEntry.create({
      data: {
        workspaceId: input.workspaceId,
        submissionId: input.submissionId,
        programId: input.programId,
        amount: input.amount,
        currency: input.currency,
        feeAmount: input.feeAmount,
        netAmount: input.netAmount,
        occurredAt: input.occurredAt ?? new Date(),
        notes: input.notes ?? null,
      },
    });
  }

  listRewardLedgerForWorkspace(workspaceId: string, since?: Date): Promise<RewardLedgerEntry[]> {
    return this.txHost.tx.rewardLedgerEntry.findMany({
      where: {
        workspaceId,
        ...(since ? { occurredAt: { gte: since } } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }],
      take: 5000,
    });
  }

  listAnalyticsProjection(workspaceId: string): Promise<SubmissionAnalyticsProjection[]> {
    return this.txHost.tx.submission.findMany({
      where: { workspaceId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        submittedAt: true,
        responseAt: true,
        updatedAt: true,
      },
      take: 20000,
    });
  }
}
