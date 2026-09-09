import { HttpStatus, Injectable } from '@nestjs/common';
import type { FindingVerificationDto, FindingVerificationStatus } from '@pentesthub/shared';
import type { AuditEventType, Prisma } from '../../prisma-types.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

interface FindingRow {
  id: string;
  verificationStatus: string;
  verificationEvidenceId: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | string | null;
}

function toDto(findingId: string, row: FindingRow): FindingVerificationDto {
  return {
    findingId,
    status: row.verificationStatus as FindingVerificationStatus,
    verificationEvidenceId: row.verificationEvidenceId,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt ? new Date(row.verifiedAt).toISOString() : null,
  };
}

/// Module 17 — task #477 (Finding Verification, spec section 22: "OPEN ->
/// FIXED_CLAIMED -> VERIFICATION -> VERIFIED -> CLOSED" and "verification
/// must require actual evidence"). Operates on `BugBountyFinding`'s
/// Module-17-additive `verificationStatus`/`verificationEvidenceId`/
/// `verifiedBy`/`verifiedAt` columns (see that model's own doc comment in
/// schema.prisma) — not a new model, per the platform's "extend, don't
/// duplicate" precedent.
///
/// The one rule that actually matters here: a transition *to* VERIFIED is
/// rejected unless a real `Evidence` row (scoped to this workspace) is
/// attached, either freshly supplied on this call or already recorded
/// from an earlier one. This is the sole gate `RemediationService
/// .setStatus` relies on before allowing a finding-linked remediation task
/// to close — the AI Security Analyst (task #471) and any human caller
/// both go through this same check; there is no other code path that can
/// set `verificationStatus` to VERIFIED.
@Injectable()
export class FindingVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  private get findingTable() {
    return (
      this.prisma as unknown as {
        bugBountyFinding: {
          findFirst: (args: unknown) => Promise<FindingRow | null>;
          update: (args: unknown) => Promise<FindingRow>;
        };
      }
    ).bugBountyFinding;
  }

  private async audit(userId: string, type: AuditEventType, metadata: Record<string, unknown>): Promise<void> {
    await this.prisma.auditEvent.create({
      data: { userId, type, ipAddress: '0.0.0.0', userAgent: 'api', metadata: metadata as Prisma.InputJsonValue },
    });
  }

  async get(findingId: string, workspaceId: string): Promise<FindingVerificationDto> {
    const row = await this.requireFinding(findingId, workspaceId);
    return toDto(findingId, row);
  }

  async setVerification(
    findingId: string,
    workspaceId: string,
    userId: string,
    status: FindingVerificationStatus,
    verificationEvidenceId?: string,
  ): Promise<FindingVerificationDto> {
    const existing = await this.requireFinding(findingId, workspaceId);

    if (status === 'VERIFIED') {
      const evidenceId = verificationEvidenceId ?? existing.verificationEvidenceId ?? undefined;
      if (!evidenceId) {
        throw new AppException(
          'VERIFICATION_REQUIRES_EVIDENCE',
          'Marking a finding VERIFIED requires a real Evidence row — supply verificationEvidenceId.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const evidence = await this.prisma.evidence.findFirst({
        where: { id: evidenceId, deletedAt: null, project: { workspaceId } },
      });
      if (!evidence) {
        throw new AppException('EVIDENCE_NOT_FOUND', 'Evidence not found.', HttpStatus.NOT_FOUND);
      }

      const row = await this.findingTable.update({
        where: { id: findingId },
        data: { verificationStatus: status, verificationEvidenceId: evidenceId, verifiedBy: userId, verifiedAt: new Date() },
      });
      await this.audit(userId, 'FINDING_VERIFIED', { findingId, workspaceId, verificationEvidenceId: evidenceId });
      return toDto(findingId, row);
    }

    const row = await this.findingTable.update({
      where: { id: findingId },
      data: {
        verificationStatus: status,
        ...(verificationEvidenceId !== undefined ? { verificationEvidenceId } : {}),
      },
    });
    await this.audit(userId, 'FINDING_VERIFICATION_STATUS_CHANGED', { findingId, workspaceId, from: existing.verificationStatus, to: status });
    return toDto(findingId, row);
  }

  private async requireFinding(findingId: string, workspaceId: string): Promise<FindingRow> {
    const row = await this.findingTable.findFirst({
      where: { id: findingId, workspaceId, deletedAt: null },
      select: { id: true, verificationStatus: true, verificationEvidenceId: true, verifiedBy: true, verifiedAt: true },
    });
    if (!row) {
      throw new AppException('BUGBOUNTY_FINDING_NOT_FOUND', 'Finding not found.', HttpStatus.NOT_FOUND);
    }
    return row;
  }
}
