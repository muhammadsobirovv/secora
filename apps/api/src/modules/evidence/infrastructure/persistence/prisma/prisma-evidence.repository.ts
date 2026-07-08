import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateEvidenceInput,
  EvidenceRepository,
  UpdateEvidenceInput,
} from '../../../domain/repositories/evidence.repository.interface.js';
import type { Evidence } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaEvidenceRepository implements EvidenceRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateEvidenceInput): Promise<Evidence> {
    return this.txHost.tx.evidence.create({ data: input });
  }

  findById(id: string): Promise<Evidence | null> {
    return this.txHost.tx.evidence.findFirst({
      where: { id, deletedAt: null },
    });
  }

  update(id: string, data: UpdateEvidenceInput): Promise<Evidence> {
    return this.txHost.tx.evidence.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<Evidence> {
    return this.txHost.tx.evidence.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  list(projectId: string, targetId?: string): Promise<Evidence[]> {
    return this.txHost.tx.evidence.findMany({
      where: {
        projectId,
        deletedAt: null,
        ...(targetId ? { targetId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
