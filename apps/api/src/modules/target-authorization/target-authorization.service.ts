import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  DEFAULT_TARGET_AUTHORIZATION_MONTHS,
  TARGET_ATTESTATION_VERSION,
  TARGET_AUTHORIZATION_BASES,
  type AttestTargetAuthorizationRequestDto,
  type TargetAuthorizationDto,
  type TargetAuthorizationStatusDto,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';
import type { AppTransactionalAdapter } from '../../prisma/prisma-transaction.types.js';
import type { TargetAuthorization } from '../../prisma-types.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuditService } from '../audit/audit.service.js';
import {
  classifyScopeValue,
  type ScopeRule,
} from '../bugbounty/scope/classify-scope-value.util.js';
import {
  evaluateActiveScanTarget,
  parseSuffixList,
  type ActiveScanGuardOptions,
} from './active-scan-network-guard.js';

export interface RequestContextInput {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthorizationTargetRef {
  id: string;
  type: string;
  value: string;
}

/// Longest an attestation may be valid for; a user can always renew.
const MAX_AUTHORIZATION_MONTHS = 36;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function toTargetAuthorizationDto(
  row: TargetAuthorization,
): TargetAuthorizationDto {
  return {
    id: row.id,
    targetId: row.targetId,
    programId: row.programId,
    basis: row.basis,
    documentReference: row.documentReference,
    notes: row.notes,
    attestationVersion: row.attestationVersion,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

/// Per-target authorization attestation — the layer that makes a user
/// state, at scan time, how they are authorized to test an asset.
///
/// Active scans (every vulnerability scanner, and recon tools outside
/// PASSIVE_RECON_TOOLS) require a valid, unexpired attestation and must
/// pass the active-scan network guard. Passive recon only queries public
/// third-party sources and needs no attestation (the target must still be
/// in scope — ScopeEngine runs before this). Every attestation, every
/// blocked active scan and every scan start writes an audit record
/// (userId, workspaceId, target, basis, attestation version, IP).
@Injectable()
export class TargetAuthorizationService {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
    private readonly auditService: AuditService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async attestTarget(input: {
    userId: string;
    workspaceId: string;
    target: AuthorizationTargetRef;
    data: AttestTargetAuthorizationRequestDto;
    context?: RequestContextInput;
  }): Promise<TargetAuthorizationDto> {
    const { data } = input;
    if (data.attested !== true) {
      throw new AppException(
        'TARGET_AUTHORIZATION_ATTESTATION_REQUIRED',
        'Confirm that you own this asset or have current written authorization, and that you will stay inside the authorized scope.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!TARGET_AUTHORIZATION_BASES.includes(data.basis)) {
      throw new AppException(
        'TARGET_AUTHORIZATION_INVALID',
        'Unknown authorization basis.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (data.basis === 'BUG_BOUNTY_SCOPE') {
      const linked = await this.txHost.tx.bugBountyProgramTarget.count({
        where: { targetId: input.target.id },
      });
      if (linked === 0) {
        throw new AppException(
          'TARGET_AUTHORIZATION_INVALID',
          'Link this target to the bug bounty program whose scope covers it before choosing "Bug bounty scope".',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const expiresAt = this.resolveExpiry(data.expiresAt);

    const row = await this.txHost.tx.targetAuthorization.create({
      data: {
        targetId: input.target.id,
        workspaceId: input.workspaceId,
        createdBy: input.userId,
        basis: data.basis,
        documentReference: data.documentReference?.trim() || null,
        notes: data.notes?.trim() || null,
        attestationVersion: TARGET_ATTESTATION_VERSION,
        expiresAt,
        ipAddress: input.context?.ipAddress ?? 'internal',
        userAgent: input.context?.userAgent ?? 'api',
      },
    });

    await this.auditService.log({
      userId: input.userId,
      type: 'TARGET_AUTHORIZATION_ATTESTED',
      ipAddress: input.context?.ipAddress ?? 'internal',
      userAgent: input.context?.userAgent ?? 'api',
      metadata: {
        authorizationId: row.id,
        workspaceId: input.workspaceId,
        targetId: input.target.id,
        targetValue: input.target.value,
        basis: data.basis,
        attestationVersion: TARGET_ATTESTATION_VERSION,
        expiresAt: expiresAt.toISOString(),
      },
    });
    return toTargetAuthorizationDto(row);
  }

  /// Program-level attestation made when importing a bug bounty program:
  /// covers targets linked to the program that its scope rules classify
  /// IN_SCOPE.
  async attestProgramScope(input: {
    userId: string;
    workspaceId: string;
    programId: string;
    expiresAt?: string;
    context?: RequestContextInput;
  }): Promise<TargetAuthorizationDto> {
    const expiresAt = this.resolveExpiry(input.expiresAt);
    const row = await this.txHost.tx.targetAuthorization.create({
      data: {
        programId: input.programId,
        workspaceId: input.workspaceId,
        createdBy: input.userId,
        basis: 'BUG_BOUNTY_SCOPE',
        attestationVersion: TARGET_ATTESTATION_VERSION,
        expiresAt,
        ipAddress: input.context?.ipAddress ?? 'internal',
        userAgent: input.context?.userAgent ?? 'api',
      },
    });
    await this.auditService.log({
      userId: input.userId,
      type: 'TARGET_AUTHORIZATION_ATTESTED',
      ipAddress: input.context?.ipAddress ?? 'internal',
      userAgent: input.context?.userAgent ?? 'api',
      metadata: {
        authorizationId: row.id,
        workspaceId: input.workspaceId,
        programId: input.programId,
        basis: 'BUG_BOUNTY_SCOPE',
        attestationVersion: TARGET_ATTESTATION_VERSION,
        expiresAt: expiresAt.toISOString(),
      },
    });
    return toTargetAuthorizationDto(row);
  }

  async getStatus(
    target: AuthorizationTargetRef,
    now = new Date(),
  ): Promise<TargetAuthorizationStatusDto> {
    const own = await this.txHost.tx.targetAuthorization.findFirst({
      where: { targetId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    if (own && own.expiresAt > now) {
      return {
        authorized: true,
        current: toTargetAuthorizationDto(own),
        reason: null,
      };
    }

    // Program-scope attestation: target linked to a program whose scope
    // rules classify it IN_SCOPE, and whose import attestation is valid.
    const links = await this.txHost.tx.bugBountyProgramTarget.findMany({
      where: { targetId: target.id },
      select: { programId: true },
    });
    let programExpired = false;
    for (const { programId } of links) {
      const programAttestation =
        await this.txHost.tx.targetAuthorization.findFirst({
          where: { programId, targetId: null },
          orderBy: { createdAt: 'desc' },
        });
      if (!programAttestation) continue;
      if (programAttestation.expiresAt <= now) {
        programExpired = true;
        continue;
      }
      const scopeItems =
        await this.txHost.tx.bugBountyProgramScopeItem.findMany({
          where: { programId },
        });
      const rules: ScopeRule[] = scopeItems.map((item) => ({
        id: item.id,
        type: item.type,
        pattern: item.pattern,
        classification: item.classification,
      }));
      if (
        classifyScopeValue(target.value, rules).classification === 'IN_SCOPE'
      ) {
        return {
          authorized: true,
          current: toTargetAuthorizationDto(programAttestation),
          reason: null,
        };
      }
    }

    return {
      authorized: false,
      current: own ? toTargetAuthorizationDto(own) : null,
      reason: own || programExpired ? 'EXPIRED' : 'MISSING',
    };
  }

  /// Throws 403 unless an ACTIVE scan of this target may start. Call after
  /// ScopeEngine (which handles in-scope / out-of-scope) and before the job
  /// is created. Blocked attempts are audited.
  async assertActiveScanAllowed(input: {
    userId: string;
    workspaceId: string;
    target: AuthorizationTargetRef;
    operationType: string;
    context?: RequestContextInput;
  }): Promise<TargetAuthorizationDto> {
    const status = await this.getStatus(input.target);
    if (!status.authorized || !status.current) {
      const expired = status.reason === 'EXPIRED';
      await this.auditBlocked(
        input,
        expired ? 'AUTHORIZATION_EXPIRED' : 'AUTHORIZATION_MISSING',
      );
      throw new AppException(
        expired
          ? 'TARGET_AUTHORIZATION_EXPIRED'
          : 'TARGET_AUTHORIZATION_REQUIRED',
        expired
          ? 'The authorization for this target has expired. Confirm your current authorization before running active scans.'
          : 'Confirm how you are authorized to test this target (owner, written permission, or bug bounty scope) before running active scans.',
        HttpStatus.FORBIDDEN,
      );
    }

    const guard = await evaluateActiveScanTarget(
      input.target,
      this.guardOptions(),
    );
    if (!guard.allowed) {
      await this.auditBlocked(input, 'NETWORK_GUARD', guard.reason);
      throw new AppException(
        'TARGET_FORBIDDEN_FOR_ACTIVE_SCAN',
        guard.reason,
        HttpStatus.FORBIDDEN,
      );
    }
    return status.current;
  }

  /// Immutable record of a scan start, written once the job exists.
  async recordScanStarted(input: {
    userId: string;
    workspaceId: string;
    target: AuthorizationTargetRef;
    operationType: string;
    jobId: string;
    tools: string[];
    active: boolean;
    authorization: TargetAuthorizationDto | null;
    context?: RequestContextInput;
  }): Promise<void> {
    await this.auditService.log({
      userId: input.userId,
      type: 'SCAN_STARTED',
      ipAddress: input.context?.ipAddress ?? 'internal',
      userAgent: input.context?.userAgent ?? `scan/${input.operationType}`,
      metadata: {
        workspaceId: input.workspaceId,
        targetId: input.target.id,
        targetValue: input.target.value,
        operationType: input.operationType,
        jobId: input.jobId,
        tools: input.tools,
        mode: input.active ? 'ACTIVE' : 'PASSIVE',
        authorizationId: input.authorization?.id ?? null,
        basis: input.authorization?.basis ?? null,
        attestationVersion: input.authorization?.attestationVersion ?? null,
      },
    });
  }

  private async auditBlocked(
    input: {
      userId: string;
      workspaceId: string;
      target: AuthorizationTargetRef;
      operationType: string;
      context?: RequestContextInput;
    },
    reason: string,
    detail?: string,
  ): Promise<void> {
    await this.auditService.log({
      userId: input.userId,
      type: 'ACTIVE_SCAN_BLOCKED',
      ipAddress: input.context?.ipAddress ?? 'internal',
      userAgent: input.context?.userAgent ?? `scan/${input.operationType}`,
      metadata: {
        workspaceId: input.workspaceId,
        targetId: input.target.id,
        targetValue: input.target.value,
        operationType: input.operationType,
        reason,
        detail: detail ?? null,
      },
    });
  }

  private guardOptions(): ActiveScanGuardOptions {
    return {
      allowPrivateTargets: this.configService.get(
        'ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS',
        { infer: true },
      ),
      denylist: parseSuffixList(
        this.configService.get('ACTIVE_SCAN_DENYLIST', { infer: true }),
      ),
      allowlist: parseSuffixList(
        this.configService.get('ACTIVE_SCAN_ALLOWLIST', { infer: true }),
      ),
    };
  }

  private resolveExpiry(raw: string | undefined, now = new Date()): Date {
    if (!raw) return addMonths(now, DEFAULT_TARGET_AUTHORIZATION_MONTHS);
    const expiresAt = new Date(raw);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
      throw new AppException(
        'TARGET_AUTHORIZATION_INVALID',
        'The authorization expiry must be a future date.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (expiresAt > addMonths(now, MAX_AUTHORIZATION_MONTHS)) {
      throw new AppException(
        'TARGET_AUTHORIZATION_INVALID',
        `An authorization can be valid for at most ${MAX_AUTHORIZATION_MONTHS} months; renew it when it expires.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return expiresAt;
  }
}
