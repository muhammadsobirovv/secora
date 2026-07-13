import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateVulnScanTemplateInput,
  VulnScanTemplatesRepository,
} from '../../../domain/repositories/vuln-scan-templates.repository.interface.js';
import type { Prisma, VulnScanTemplate } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaVulnScanTemplatesRepository implements VulnScanTemplatesRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateVulnScanTemplateInput): Promise<VulnScanTemplate> {
    return this.txHost.tx.vulnScanTemplate.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        scanners: input.scanners,
        // Coalesce null -> undefined — see prisma-vuln-scan-jobs.repository.ts's
        // identical comment.
        config: (input.config ?? undefined) as
          Prisma.InputJsonValue | undefined,
        createdBy: input.createdBy,
      },
    });
  }

  findById(id: string): Promise<VulnScanTemplate | null> {
    return this.txHost.tx.vulnScanTemplate.findUnique({ where: { id } });
  }

  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<VulnScanTemplate | null> {
    return this.txHost.tx.vulnScanTemplate.findFirst({
      where: { id, workspaceId },
    });
  }

  list(workspaceId: string): Promise<VulnScanTemplate[]> {
    return this.txHost.tx.vulnScanTemplate.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteIfNotBuiltIn(
    id: string,
    workspaceId: string,
  ): Promise<VulnScanTemplate | null> {
    // Read before delete so the caller still gets the full row back (a
    // deleteMany's count alone can't reconstruct it) — the delete itself
    // still uses the WHERE clause as the actual isBuiltIn guard, this
    // read is just for the return value.
    const existing = await this.findByIdForWorkspace(id, workspaceId);
    if (!existing || existing.isBuiltIn) return null;

    const result = await this.txHost.tx.vulnScanTemplate.deleteMany({
      where: { id, workspaceId, isBuiltIn: false },
    });
    return result.count > 0 ? existing : null;
  }
}
