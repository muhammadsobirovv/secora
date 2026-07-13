import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  ListVulnFindingsFilter,
  UpsertedVulnFinding,
  UpsertFindingInput,
  VulnFindingsRepository,
} from '../../../domain/repositories/vuln-findings.repository.interface.js';
import type {
  Prisma,
  VulnFinding,
  VulnFindingSeverity,
  VulnFindingStatus,
} from '../../../../../prisma-types.js';

const ALL_SEVERITIES: VulnFindingSeverity[] = [
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];
const ALL_STATUSES: VulnFindingStatus[] = [
  'NEW',
  'CONFIRMED',
  'DUPLICATE',
  'ACCEPTED_RISK',
  'FIXED',
  'FALSE_POSITIVE',
];

@Injectable()
export class PrismaVulnFindingsRepository implements VulnFindingsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  /// One upsert per finding, run concurrently via Promise.all — same
  /// reasoning as PrismaReconFindingsRepository (Module 3): this always
  /// runs inside VulnScanJobExecutionService's own @Transactional()
  /// persistToolResult(), so a nested this.txHost.tx.$transaction(...)
  /// batch here would be invalid. The existence check before each upsert
  /// is what lets the execution service tell FindingCreated and
  /// FindingUpdated apart (Prisma's upsert() itself doesn't report which
  /// branch fired) — a benign race under truly concurrent re-scans of the
  /// same target might occasionally mis-report wasCreated, which only
  /// affects which activity-timeline event fires, never data integrity
  /// (the unique constraint is still the actual dedup enforcement).
  upsertMany(findings: UpsertFindingInput[]): Promise<UpsertedVulnFinding[]> {
    return Promise.all(
      findings.map(async (f) => {
        const where = {
          targetId_scanner_dedupKey: {
            targetId: f.targetId,
            scanner: f.scanner,
            dedupKey: f.dedupKey,
          },
        };
        const existing = await this.txHost.tx.vulnFinding.findUnique({
          where,
          select: { id: true },
        });

        const finding = await this.txHost.tx.vulnFinding.upsert({
          where,
          create: {
            jobId: f.jobId,
            workspaceId: f.workspaceId,
            projectId: f.projectId,
            targetId: f.targetId,
            title: f.title,
            description: f.description,
            severity: f.severity,
            cvssScore: f.cvssScore,
            cvssVector: f.cvssVector,
            cwe: f.cwe,
            owaspCategory: f.owaspCategory,
            scanner: f.scanner,
            scannerVersion: f.scannerVersion,
            confidence: f.confidence,
            vulnType: f.vulnType,
            path: f.path,
            signature: f.signature,
            matchedAt: f.matchedAt,
            data: f.data as Prisma.InputJsonValue,
            dedupKey: f.dedupKey,
            tags: f.tags,
            references: f.references,
            createdBy: f.createdBy,
            requestEvidenceId: f.requestEvidenceId,
            responseEvidenceId: f.responseEvidenceId,
            screenshotEvidenceId: f.screenshotEvidenceId,
            payloadEvidenceId: f.payloadEvidenceId,
            commandEvidenceId: f.commandEvidenceId,
            rawOutputEvidenceId: f.rawOutputEvidenceId,
          },
          update: {
            jobId: f.jobId,
            title: f.title,
            description: f.description,
            severity: f.severity,
            cvssScore: f.cvssScore,
            cvssVector: f.cvssVector,
            cwe: f.cwe,
            owaspCategory: f.owaspCategory,
            scannerVersion: f.scannerVersion,
            confidence: f.confidence,
            vulnType: f.vulnType,
            path: f.path,
            matchedAt: f.matchedAt,
            data: f.data as Prisma.InputJsonValue,
            tags: f.tags,
            references: f.references,
            lastSeenAt: new Date(),
            requestEvidenceId: f.requestEvidenceId,
            responseEvidenceId: f.responseEvidenceId,
            screenshotEvidenceId: f.screenshotEvidenceId,
            payloadEvidenceId: f.payloadEvidenceId,
            commandEvidenceId: f.commandEvidenceId,
            rawOutputEvidenceId: f.rawOutputEvidenceId,
            // status is deliberately NOT reset here — see interface
            // comment: an analyst's triage decision on a still-present
            // finding survives a re-scan.
          },
        });

        return { finding, wasCreated: !existing };
      }),
    );
  }

  findById(id: string): Promise<VulnFinding | null> {
    return this.txHost.tx.vulnFinding.findUnique({ where: { id } });
  }

  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<VulnFinding | null> {
    return this.txHost.tx.vulnFinding.findFirst({
      where: { id, workspaceId },
    });
  }

  list(filter: ListVulnFindingsFilter): Promise<VulnFinding[]> {
    return this.txHost.tx.vulnFinding.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.targetId ? { targetId: filter.targetId } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.jobId ? { jobId: filter.jobId } : {}),
        ...(filter.severity ? { severity: filter.severity } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.scanner ? { scanner: filter.scanner } : {}),
        ...(filter.search
          ? {
              OR: [
                { title: { contains: filter.search, mode: 'insensitive' } },
                { path: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
      take: filter.limit ?? 200,
    });
  }

  updateStatus(id: string, status: VulnFindingStatus): Promise<VulnFinding> {
    return this.txHost.tx.vulnFinding.update({
      where: { id },
      data: { status },
    });
  }

  async bulkUpdateStatus(
    ids: string[],
    workspaceId: string,
    status: VulnFindingStatus,
  ): Promise<VulnFinding[]> {
    await this.txHost.tx.vulnFinding.updateMany({
      where: { id: { in: ids }, workspaceId },
      data: { status },
    });
    return this.txHost.tx.vulnFinding.findMany({
      where: { id: { in: ids }, workspaceId },
    });
  }

  async countBySeverity(
    workspaceId: string,
  ): Promise<Record<VulnFindingSeverity, number>> {
    const grouped = await this.txHost.tx.vulnFinding.groupBy({
      by: ['severity'],
      where: { workspaceId },
      _count: { _all: true },
    });
    const result = Object.fromEntries(
      ALL_SEVERITIES.map((s) => [s, 0]),
    ) as Record<VulnFindingSeverity, number>;
    for (const row of grouped) {
      result[row.severity] = row._count._all;
    }
    return result;
  }

  async countByStatus(
    workspaceId: string,
  ): Promise<Record<VulnFindingStatus, number>> {
    const grouped = await this.txHost.tx.vulnFinding.groupBy({
      by: ['status'],
      where: { workspaceId },
      _count: { _all: true },
    });
    const result = Object.fromEntries(
      ALL_STATUSES.map((s) => [s, 0]),
    ) as Record<VulnFindingStatus, number>;
    for (const row of grouped) {
      result[row.status] = row._count._all;
    }
    return result;
  }
}
