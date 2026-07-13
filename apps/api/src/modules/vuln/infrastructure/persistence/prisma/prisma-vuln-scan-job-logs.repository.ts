import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  AppendLogInput,
  VulnScanJobLogsRepository,
} from '../../../domain/repositories/vuln-scan-job-logs.repository.interface.js';
import type { VulnScanJobLog } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaVulnScanJobLogsRepository implements VulnScanJobLogsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  append(input: AppendLogInput): Promise<VulnScanJobLog> {
    return this.txHost.tx.vulnScanJobLog.create({ data: input });
  }

  listSince(jobId: string, sinceSeq: bigint | null): Promise<VulnScanJobLog[]> {
    return this.txHost.tx.vulnScanJobLog.findMany({
      where: {
        jobId,
        ...(sinceSeq !== null ? { seq: { gt: sinceSeq } } : {}),
      },
      orderBy: { seq: 'asc' },
    });
  }
}
