import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CompleteToolRunInput,
  CreateToolRunsInput,
  VulnScanJobToolRunsRepository,
} from '../../../domain/repositories/vuln-scan-job-tool-runs.repository.interface.js';
import type { VulnScanJobToolRun } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaVulnScanJobToolRunsRepository implements VulnScanJobToolRunsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async createMany(input: CreateToolRunsInput): Promise<VulnScanJobToolRun[]> {
    await this.txHost.tx.vulnScanJobToolRun.createMany({
      data: input.scanners.map((scanner) => ({ jobId: input.jobId, scanner })),
    });
    return this.listForJob(input.jobId);
  }

  listForJob(jobId: string): Promise<VulnScanJobToolRun[]> {
    return this.txHost.tx.vulnScanJobToolRun.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
    });
  }

  markStarted(id: string): Promise<VulnScanJobToolRun> {
    return this.txHost.tx.vulnScanJobToolRun.update({
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
  }

  markComplete(
    id: string,
    input: CompleteToolRunInput,
  ): Promise<VulnScanJobToolRun> {
    return this.txHost.tx.vulnScanJobToolRun.update({
      where: { id },
      data: {
        status: input.status,
        completedAt: new Date(),
        exitCode: input.exitCode,
        findingsCount: input.findingsCount,
        errorMessage: input.errorMessage,
        rawOutputEvidenceId: input.rawOutputEvidenceId,
      },
    });
  }
}
