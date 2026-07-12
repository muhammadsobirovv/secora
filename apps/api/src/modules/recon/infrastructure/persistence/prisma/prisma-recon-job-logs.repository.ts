import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  AppendLogInput,
  ReconJobLogsRepository,
} from '../../../domain/repositories/recon-job-logs.repository.interface.js';
import type { ReconJobLog } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaReconJobLogsRepository implements ReconJobLogsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  append(input: AppendLogInput): Promise<ReconJobLog> {
    return this.txHost.tx.reconJobLog.create({ data: input });
  }

  listSince(jobId: string, sinceSeq: bigint | null): Promise<ReconJobLog[]> {
    return this.txHost.tx.reconJobLog.findMany({
      where: {
        jobId,
        ...(sinceSeq !== null ? { seq: { gt: sinceSeq } } : {}),
      },
      orderBy: { seq: 'asc' },
    });
  }
}
