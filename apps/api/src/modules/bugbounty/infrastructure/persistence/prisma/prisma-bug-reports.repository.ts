import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import {
  BugReportVersionConflictError,
  type BugReportsRepository,
  type CreateBugReportInput,
  type ListBugReportsFilter,
  type UpdateBugReportInput,
} from '../../../domain/repositories/bug-reports.repository.interface.js';
import type {
  BugReport,
  BugReportStatus,
  Prisma,
} from '../../../../../prisma-types.js';

const ALL_STATUSES: BugReportStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'TRIAGED',
  'ACCEPTED',
  'REJECTED',
  'DUPLICATE',
  'RESOLVED',
  'CLOSED',
];

@Injectable()
export class PrismaBugReportsRepository implements BugReportsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async create(input: CreateBugReportInput): Promise<BugReport> {
    const report = await this.txHost.tx.bugReport.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        programId: input.programId,
        findingId: input.findingId ?? null,
        title: input.title,
        template: input.template ?? 'MARKDOWN',
        ...(input.templateKind !== undefined
          ? { templateKind: input.templateKind }
          : {}),
        customTemplateId: input.customTemplateId ?? null,
        summary: input.summary ?? null,
        impact: input.impact ?? null,
        stepsToReproduce: input.stepsToReproduce ?? null,
        proofOfConcept: input.proofOfConcept ?? null,
        cwe: input.cwe ?? null,
        cvssScore: input.cvssScore ?? null,
        cvssVector: input.cvssVector ?? null,
        references: input.references ?? [],
        mitigation: input.mitigation ?? null,
        createdBy: input.createdBy,
      },
    });
    if (input.evidenceIds?.length) {
      await this.setEvidenceLinks(report.id, input.evidenceIds);
    }
    return report;
  }

  findById(id: string): Promise<BugReport | null> {
    return this.txHost.tx.bugReport.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<BugReport | null> {
    return this.txHost.tx.bugReport.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
  }

  list(filter: ListBugReportsFilter): Promise<BugReport[]> {
    return this.txHost.tx.bugReport.findMany({
      where: {
        workspaceId: filter.workspaceId,
        deletedAt: null,
        ...(filter.programId ? { programId: filter.programId } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.findingId ? { findingId: filter.findingId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.search
          ? { title: { contains: filter.search, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /// Optimistic locking: the WHERE clause pins both id and the caller's
  /// last-seen version, and version is bumped in the same UPDATE. If
  /// updateMany() reports 0 rows affected, either the report doesn't
  /// exist or — far more likely, since existence is checked by the
  /// caller before this runs — someone else's update already moved the
  /// version forward, so we re-read and throw
  /// BugReportVersionConflictError rather than silently overwriting.
  async update(id: string, input: UpdateBugReportInput): Promise<BugReport> {
    const result = await this.txHost.tx.bugReport.updateMany({
      where: { id, version: input.expectedVersion },
      data: {
        version: { increment: 1 },
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.template !== undefined ? { template: input.template } : {}),
        ...(input.templateKind !== undefined
          ? { templateKind: input.templateKind }
          : {}),
        ...(input.customTemplateId !== undefined
          ? { customTemplateId: input.customTemplateId }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.impact !== undefined ? { impact: input.impact } : {}),
        ...(input.stepsToReproduce !== undefined
          ? { stepsToReproduce: input.stepsToReproduce }
          : {}),
        ...(input.proofOfConcept !== undefined
          ? { proofOfConcept: input.proofOfConcept }
          : {}),
        ...(input.cwe !== undefined ? { cwe: input.cwe } : {}),
        ...(input.cvssScore !== undefined
          ? { cvssScore: input.cvssScore }
          : {}),
        ...(input.cvssVector !== undefined
          ? { cvssVector: input.cvssVector }
          : {}),
        ...(input.references !== undefined
          ? { references: input.references }
          : {}),
        ...(input.mitigation !== undefined
          ? { mitigation: input.mitigation }
          : {}),
        ...(input.bountyAmount !== undefined
          ? { bountyAmount: input.bountyAmount }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.platformReportUrl !== undefined
          ? { platformReportUrl: input.platformReportUrl }
          : {}),
        ...(input.platformReportId !== undefined
          ? { platformReportId: input.platformReportId }
          : {}),
        ...(input.submittedAt !== undefined
          ? { submittedAt: input.submittedAt }
          : {}),
        ...(input.triagedAt !== undefined
          ? { triagedAt: input.triagedAt }
          : {}),
        ...(input.resolvedAt !== undefined
          ? { resolvedAt: input.resolvedAt }
          : {}),
        ...(input.closedAt !== undefined ? { closedAt: input.closedAt } : {}),
        ...(input.aiGenerated !== undefined
          ? { aiGenerated: input.aiGenerated }
          : {}),
        ...(input.aiModel !== undefined ? { aiModel: input.aiModel } : {}),
        ...(input.aiGeneratedAt !== undefined
          ? { aiGeneratedAt: input.aiGeneratedAt }
          : {}),
        ...(input.grammarCheckedAt !== undefined
          ? { grammarCheckedAt: input.grammarCheckedAt }
          : {}),
        ...(input.technicalReview !== undefined
          ? {
              technicalReview:
                input.technicalReview === null
                  ? Prisma.JsonNull
                  : (input.technicalReview as Prisma.InputJsonValue),
            }
          : {}),
      },
    });

    if (result.count === 0) {
      throw new BugReportVersionConflictError(id);
    }

    if (input.evidenceIds !== undefined) {
      await this.setEvidenceLinks(id, input.evidenceIds);
    }

    const updated = await this.txHost.tx.bugReport.findUniqueOrThrow({
      where: { id },
    });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.txHost.tx.bugReport.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listEvidenceIds(reportId: string): Promise<string[]> {
    const links = await this.txHost.tx.bugReportEvidence.findMany({
      where: { reportId },
      select: { evidenceId: true },
    });
    return links.map((l) => l.evidenceId);
  }

  async setEvidenceLinks(
    reportId: string,
    evidenceIds: string[],
  ): Promise<void> {
    await this.txHost.tx.bugReportEvidence.deleteMany({ where: { reportId } });
    if (evidenceIds.length === 0) return;
    await this.txHost.tx.bugReportEvidence.createMany({
      data: evidenceIds.map((evidenceId) => ({ reportId, evidenceId })),
      skipDuplicates: true,
    });
  }

  async countByStatus(
    workspaceId: string,
  ): Promise<Record<BugReportStatus, number>> {
    const grouped = await this.txHost.tx.bugReport.groupBy({
      by: ['status'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const result = Object.fromEntries(
      ALL_STATUSES.map((s) => [s, 0]),
    ) as Record<BugReportStatus, number>;
    for (const row of grouped) {
      result[row.status] = row._count._all;
    }
    return result;
  }

  async sumBountyAmount(
    workspaceId: string,
    status?: BugReportStatus,
  ): Promise<number> {
    const result = await this.txHost.tx.bugReport.aggregate({
      where: {
        workspaceId,
        deletedAt: null,
        ...(status ? { status } : {}),
      },
      _sum: { bountyAmount: true },
    });
    return result._sum.bountyAmount ?? 0;
  }
}
