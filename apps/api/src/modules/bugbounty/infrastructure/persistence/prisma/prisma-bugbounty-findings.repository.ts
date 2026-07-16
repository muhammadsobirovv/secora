import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  BugBountyFindingsRepository,
  CreateBugBountyFindingInput,
  DuplicateCandidateProjection,
  ListBugBountyFindingsFilter,
  TransitionStageInput,
  UpdateBugBountyFindingInput,
} from '../../../domain/repositories/bugbounty-findings.repository.interface.js';
import type {
  BugBountyFinding,
  BugBountyFindingStage,
} from '../../../../../prisma-types.js';

const ALL_STAGES: BugBountyFindingStage[] = [
  'NEW',
  'TRIAGED',
  'VERIFIED',
  'REPORTED',
  'DUPLICATE',
  'NEED_MORE_INFO',
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
];

@Injectable()
export class PrismaBugBountyFindingsRepository implements BugBountyFindingsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async create(input: CreateBugBountyFindingInput): Promise<BugBountyFinding> {
    const finding = await this.txHost.tx.bugBountyFinding.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        programId: input.programId,
        targetId: input.targetId ?? null,
        vulnFindingId: input.vulnFindingId ?? null,
        title: input.title,
        description: input.description,
        severity: input.severity,
        cvssScore: input.cvssScore ?? null,
        cvssVector: input.cvssVector ?? null,
        cwe: input.cwe ?? null,
        vulnType: input.vulnType ?? null,
        endpoint: input.endpoint ?? null,
        payload: input.payload ?? null,
        tags: input.tags ?? [],
        createdBy: input.createdBy,
      },
    });
    if (input.evidenceIds?.length) {
      await this.setEvidenceLinks(finding.id, input.evidenceIds);
    }
    return finding;
  }

  findById(id: string): Promise<BugBountyFinding | null> {
    return this.txHost.tx.bugBountyFinding.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<BugBountyFinding | null> {
    return this.txHost.tx.bugBountyFinding.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
  }

  list(filter: ListBugBountyFindingsFilter): Promise<BugBountyFinding[]> {
    return this.txHost.tx.bugBountyFinding.findMany({
      where: {
        workspaceId: filter.workspaceId,
        deletedAt: null,
        ...(filter.programId ? { programId: filter.programId } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.targetId ? { targetId: filter.targetId } : {}),
        ...(filter.stage ? { stage: filter.stage } : {}),
        ...(filter.severity ? { severity: filter.severity } : {}),
        ...(filter.search
          ? {
              OR: [
                { title: { contains: filter.search, mode: 'insensitive' } },
                { endpoint: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: filter.limit ?? 200,
    });
  }

  update(
    id: string,
    input: UpdateBugBountyFindingInput,
  ): Promise<BugBountyFinding> {
    return this.txHost.tx.bugBountyFinding.update({
      where: { id },
      data: {
        ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
        ...(input.vulnFindingId !== undefined
          ? { vulnFindingId: input.vulnFindingId }
          : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.severity !== undefined ? { severity: input.severity } : {}),
        ...(input.cvssScore !== undefined
          ? { cvssScore: input.cvssScore }
          : {}),
        ...(input.cvssVector !== undefined
          ? { cvssVector: input.cvssVector }
          : {}),
        ...(input.cwe !== undefined ? { cwe: input.cwe } : {}),
        ...(input.vulnType !== undefined ? { vulnType: input.vulnType } : {}),
        ...(input.endpoint !== undefined ? { endpoint: input.endpoint } : {}),
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
    });
  }

  transitionStage(
    id: string,
    input: TransitionStageInput,
  ): Promise<BugBountyFinding> {
    return this.txHost.tx.bugBountyFinding.update({
      where: { id },
      data: {
        stage: input.stage,
        ...(input.duplicateOfId !== undefined
          ? { duplicateOfId: input.duplicateOfId }
          : {}),
        ...(input.bountyAmount !== undefined
          ? { bountyAmount: input.bountyAmount }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
      },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.txHost.tx.bugBountyFinding.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listEvidenceIds(findingId: string): Promise<string[]> {
    const links = await this.txHost.tx.bugBountyFindingEvidence.findMany({
      where: { findingId },
      select: { evidenceId: true },
    });
    return links.map((l) => l.evidenceId);
  }

  async setEvidenceLinks(
    findingId: string,
    evidenceIds: string[],
  ): Promise<void> {
    await this.txHost.tx.bugBountyFindingEvidence.deleteMany({
      where: { findingId },
    });
    if (evidenceIds.length === 0) return;
    await this.txHost.tx.bugBountyFindingEvidence.createMany({
      data: evidenceIds.map((evidenceId) => ({ findingId, evidenceId })),
      skipDuplicates: true,
    });
  }

  findDuplicateCandidates(input: {
    workspaceId: string;
    programId?: string;
    excludeFindingId?: string;
  }): Promise<DuplicateCandidateProjection[]> {
    return this.txHost.tx.bugBountyFinding.findMany({
      where: {
        workspaceId: input.workspaceId,
        deletedAt: null,
        ...(input.programId ? { programId: input.programId } : {}),
        ...(input.excludeFindingId
          ? { id: { not: input.excludeFindingId } }
          : {}),
      },
      select: {
        id: true,
        title: true,
        targetId: true,
        endpoint: true,
        payload: true,
        vulnType: true,
        stage: true,
      },
      take: 500,
    });
  }

  async countByStage(
    workspaceId: string,
  ): Promise<Record<BugBountyFindingStage, number>> {
    const grouped = await this.txHost.tx.bugBountyFinding.groupBy({
      by: ['stage'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const result = Object.fromEntries(ALL_STAGES.map((s) => [s, 0])) as Record<
      BugBountyFindingStage,
      number
    >;
    for (const row of grouped) {
      result[row.s