import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreateSecurityApprovalRequestDto,
  SecurityApprovalRequestDto,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/// Module 16 — Approval gates (task #399). Deliberately workspace-scoped
/// and single-approver, NOT Module 10's Organization-level
/// `ApprovalWorkflow`/`ApprovalRequest` — see `SecurityApprovalRequest`'s
/// schema.prisma doc comment and ADR 0016 §5 for why a second model
/// exists instead of reusing that one.
///
/// Every caller that creates a request here is expected to *stop* and
/// wait for `APPROVED` before proceeding — this service never executes
/// anything itself, it only records the decision. The high-risk
/// operation types this gate is mandatory for (spec section 38) are
/// enumerated in `HighRiskOperationType` (`@pentesthub/shared`).
@Injectable()
export class SecurityApprovalService {
  private readonly logger = new Logger(SecurityApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async create(
    workspaceId: string,
    requestedBy: string,
    input: CreateSecurityApprovalRequestDto,
  ): Promise<SecurityApprovalRequestDto> {
    const defaultExpiryMinutes = this.configService.get(
      'SECURITY_APPROVAL_DEFAULT_EXPIRY_MINUTES',
      { infer: true },
    );
    const expiresAt = new Date(
      Date.now() + (input.expiresInMinutes ?? defaultExpiryMinutes) * 60_000,
    );

    const request = (await (this.prisma as unknown as {
      securityApprovalRequest: {
        create: (args: unknown) => Promise<Record<string, unknown>>;
      };
    }).securityApprovalRequest.create({
      data: {
        workspaceId,
        requestedBy,
        operationType: input.operationType,
        riskLevel: input.riskLevel,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        reason: input.reason ?? null,
        payload: input.payload ?? null,
        expiresAt,
      },
    })) as unknown as SecurityApprovalRow;

    await this.auditService
      .log({
        userId: requestedBy,
        type: 'SECURITY_APPROVAL_REQUESTED',
        ipAddress: 'internal',
        userAgent: `security-approval/${input.operationType}`,
        metadata: { workspaceId, operationType: input.operationType, riskLevel: input.riskLevel },
      })
      .catch((error: unknown) =>
        this.logger.warn(`Failed to write SECURITY_APPROVAL_REQUESTED audit event: ${String(error)}`),
      );

    return toDto(request);
  }

  async decide(
    id: string,
    workspaceId: string,
    deciderId: string,
    approve: boolean,
    decisionNote?: string,
  ): Promise<SecurityApprovalRequestDto> {
    const prismaAny = this.prisma as unknown as {
      securityApprovalRequest: {
        findUnique: (args: unknown) => Promise<SecurityApprovalRow | null>;
        update: (args: unknown) => Promise<SecurityApprovalRow>;
      };
    };

    const existing = await prismaAny.securityApprovalRequest.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new AppException('APPROVAL_REQUEST_NOT_FOUND', 'Approval request not found.', HttpStatus.NOT_FOUND);
    }
    if (existing.status !== 'PENDING') {
      throw new AppException('APPROVAL_ALREADY_DECIDED', 'This approval request has already been decided.', HttpStatus.CONFLICT);
    }
    if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
      throw new AppException('APPROVAL_EXPIRED', 'This approval request has expired.', HttpStatus.GONE);
    }

    const updated = await prismaAny.securityApprovalRequest.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'DENIED',
        decidedBy: deciderId,
        decisionNote: decisionNote ?? null,
        decidedAt: new Date(),
      },
    });

    await this.auditService
      .log({
        userId: deciderId,
        type: 'SECURITY_APPROVAL_DECIDED',
        ipAddress: 'internal',
        userAgent: 'security-approval/decide',
        metadata: { workspaceId, requestId: id, approved: approve },
      })
      .catch((error: unknown) =>
        this.logger.warn(`Failed to write SECURITY_APPROVAL_DECIDED audit event: ${String(error)}`),
      );

    return toDto(updated);
  }

  /// Called by any gated operation right before it would proceed —
  /// throws unless the request is APPROVED, so a caller can never
  /// accidentally treat "not yet decided" as "go ahead."
  async assertApproved(id: string, workspaceId: string): Promise<void> {
    const prismaAny = this.prisma as unknown as {
      securityApprovalRequest: { findUnique: (args: unknown) => Promise<SecurityApprovalRow | null> };
    };
    const request = await prismaAny.securityApprovalRequest.findUnique({ where: { id } });
    if (!request || request.workspaceId !== workspaceId) {
      throw new AppException('APPROVAL_REQUEST_NOT_FOUND', 'Approval request not found.', HttpStatus.NOT_FOUND);
    }
    if (request.expiresAt && new Date(request.expiresAt) < new Date() && request.status === 'PENDING') {
      throw new AppException('APPROVAL_EXPIRED', 'This approval request expired before it was decided.', HttpStatus.GONE);
    }
    if (request.status !== 'APPROVED') {
      throw new AppException('APPROVAL_REQUIRED', 'This operation requires explicit user approval before it can proceed.', HttpStatus.FORBIDDEN);
    }
  }

  async listForWorkspace(workspaceId: string): Promise<SecurityApprovalRequestDto[]> {
    const prismaAny = this.prisma as unknown as {
      securityApprovalRequest: { findMany: (args: unknown) => Promise<SecurityApprovalRow[]> };
    };
    const rows = await prismaAny.securityApprovalRequest.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toDto);
  }
}

interface SecurityApprovalRow {
  id: string;
  workspaceId: string;
  requestedBy: string;
  operationType: string;
  riskLevel: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  payload: unknown;
  status: string;
  decidedBy: string | null;
  decisionNote: string | null;
  expiresAt: Date | string | null;
  createdAt: Date | string;
  decidedAt: Date | string | null;
}

function toDto(row: SecurityApprovalRow): SecurityApprovalRequestDto {
  return {
    id: row.id,
    requestedBy: row.requestedBy,
    operationType: row.operationType,
    riskLevel: row.riskLevel as SecurityApprovalRequestDto['riskLevel'],
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    reason: row.reason,
    payload: row.payload,
    status: row.status as SecurityApprovalRequestDto['status'],
    decidedBy: row.decidedBy,
    decisionNote: row.decisionNote,
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : null,
  };
}
