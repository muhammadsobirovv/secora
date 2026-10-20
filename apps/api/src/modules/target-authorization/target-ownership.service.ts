import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';
import type {
  TargetOwnershipChallengeDto,
  TargetOwnershipStatusDto,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';
import type { AppTransactionalAdapter } from '../../prisma/prisma-transaction.types.js';
import type {
  AuditEventType,
  TargetOwnershipVerification,
} from '../../prisma-types.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuditService } from '../audit/audit.service.js';
import {
  evaluateActiveScanTarget,
  hostFromTarget,
  parseSuffixList,
  type ActiveScanGuardOptions,
} from './active-scan-network-guard.js';
import {
  OWNERSHIP_PROBE,
  OwnershipNetworkBlockedError,
  type OwnershipProbe,
} from './target-ownership.probe.js';
import type { AuthorizationTargetRef, RequestContextInput } from './target-authorization.service.js';

/// Target types whose ownership can be proven by a DNS name or a web page.
const VERIFIABLE_TYPES = new Set(['DOMAIN', 'SUBDOMAIN', 'URL']);
const DNS_PREFIX = '_secora-verify.';
const HTTP_PATH = '/.well-known/secora-verify.txt';
const MAX_FILE_BYTES = 4096;
const MAX_PAGE_BYTES = 512 * 1024;

type LastError = NonNullable<TargetOwnershipStatusDto['lastError']>;

/// Proof-of-control for active scanning. The user publishes a token in one of
/// three places; any one of them verifies the target:
///  1. a DNS TXT record `secora-verify=<token>` at `_secora-verify.<host>`;
///  2. a file `https://<host>/.well-known/secora-verify.txt` containing the token;
///  3. a meta tag `<meta name="secora-verify" content="<token>">` on the home page.
/// Verification is permanent for the target. A verified target can be scanned
/// actively (see TargetAuthorizationService.assertActiveScanAllowed).
@Injectable()
export class TargetOwnershipService {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
    private readonly auditService: AuditService,
    @Inject(OWNERSHIP_PROBE)
    private readonly probe: OwnershipProbe,
    @Inject(ConfigService)
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async getStatus(target: AuthorizationTargetRef): Promise<TargetOwnershipStatusDto> {
    this.assertVerifiable(target);
    const row = await this.findRow(target.id);
    return this.toDto(target, row);
  }

  /// Creates the token for an unverified target (or returns the existing one).
  /// A verified target keeps its verification; no new token is issued.
  async createChallenge(input: {
    userId: string;
    workspaceId: string;
    target: AuthorizationTargetRef;
    context?: RequestContextInput;
  }): Promise<TargetOwnershipStatusDto> {
    this.assertVerifiable(input.target);
    const existing = await this.findRow(input.target.id);
    if (existing?.verifiedAt) {
      return this.toDto(input.target, existing);
    }

    const row = existing
      ? existing
      : await this.txHost.tx.targetOwnershipVerification.create({
          data: {
            targetId: input.target.id,
            workspaceId: input.workspaceId,
            token: newToken(),
          },
        });

    await this.audit(input, 'TARGET_OWNERSHIP_CHALLENGE_ISSUED', {
      verificationId: row.id,
    });
    return this.toDto(input.target, row);
  }

  /// Runs the three checks in order and records the result. Refused outright
  /// (no network I/O) when the network guard blocks the target.
  async verify(input: {
    userId: string;
    workspaceId: string;
    target: AuthorizationTargetRef;
    context?: RequestContextInput;
  }): Promise<TargetOwnershipStatusDto> {
    this.assertVerifiable(input.target);
    const row = await this.findRow(input.target.id);
    if (!row) {
      throw new AppException(
        'TARGET_OWNERSHIP_CHALLENGE_REQUIRED',
        'Create a verification challenge for this target first.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (row.verifiedAt) {
      return this.toDto(input.target, row);
    }

    const guard = await evaluateActiveScanTarget(input.target, {
      ...this.guardOptions(),
      resolveHost: (name) => this.probe.resolveAddresses(name),
    });
    if (!guard.allowed) {
      await this.audit(input, 'TARGET_OWNERSHIP_BLOCKED', { reason: guard.reason });
      throw new AppException(
        'TARGET_FORBIDDEN_FOR_ACTIVE_SCAN',
        guard.reason,
        HttpStatus.FORBIDDEN,
      );
    }

    const host = hostFromTarget(input.target.type, input.target.value);
    let method: 'DNS_TXT' | 'HTTP_FILE' | 'META_TAG' | null = null;
    let lastError: LastError = 'DNS_RECORD_NOT_FOUND';
    const now = new Date();

    try {
      if (await this.hasDnsToken(host, row.token)) {
        method = 'DNS_TXT';
      } else if (await this.hasHttpFileToken(host, row.token)) {
        method = 'HTTP_FILE';
      } else if (await this.hasMetaTagToken(host, row.token)) {
        method = 'META_TAG';
      } else {
        // All three places were checked; report the last one tried.
        lastError = 'META_TAG_NOT_FOUND';
      }
    } catch (error) {
      lastError =
        error instanceof OwnershipNetworkBlockedError
          ? 'NETWORK_BLOCKED'
          : 'UNREACHABLE';
    }

    if (method) {
      const updated = await this.txHost.tx.targetOwnershipVerification.update({
        where: { id: row.id },
        data: { method, verifiedAt: now, lastCheckedAt: now, lastError: null },
      });
      await this.audit(input, 'TARGET_OWNERSHIP_VERIFIED', { method });
      return this.toDto(input.target, updated);
    }

    const updated = await this.txHost.tx.targetOwnershipVerification.update({
      where: { id: row.id },
      data: { lastCheckedAt: now, lastError },
    });
    await this.audit(input, 'TARGET_OWNERSHIP_CHECK_FAILED', { lastError });
    return this.toDto(input.target, updated);
  }

  /// Gate used before any ACTIVE scan. Throws unless the target is verified.
  async assertVerified(target: AuthorizationTargetRef): Promise<void> {
    const row = await this.findRow(target.id);
    if (!row?.verifiedAt) {
      throw new AppException(
        'TARGET_OWNERSHIP_NOT_VERIFIED',
        'Verify that you control this website before running active scans. Passive checks are still available.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async hasDnsToken(host: string, token: string): Promise<boolean> {
    const values = await this.probe.dnsTxtValues(`${DNS_PREFIX}${host}`);
    return values.some((v) => v.trim() === `secora-verify=${token}`);
  }

  private async hasHttpFileToken(host: string, token: string): Promise<boolean> {
    const { status, body } = await this.probe.fetchText(host, HTTP_PATH, MAX_FILE_BYTES);
    return status === 200 && body.trim() === token;
  }

  private async hasMetaTagToken(host: string, token: string): Promise<boolean> {
    const { status, body } = await this.probe.fetchText(host, '/', MAX_PAGE_BYTES);
    if (status !== 200) return false;
    for (const tag of body.match(/<meta\b[^>]*>/gi) ?? []) {
      const name = /\bname\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
      const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
      if (name === 'secora-verify' && content === token) return true;
    }
    return false;
  }

  private assertVerifiable(target: AuthorizationTargetRef): void {
    if (!VERIFIABLE_TYPES.has(target.type)) {
      throw new AppException(
        'TARGET_OWNERSHIP_UNSUPPORTED',
        'Ownership can be verified for domains, subdomains and web URLs only.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private findRow(targetId: string): Promise<TargetOwnershipVerification | null> {
    return this.txHost.tx.targetOwnershipVerification.findUnique({
      where: { targetId },
    });
  }

  private toDto(
    target: AuthorizationTargetRef,
    row: TargetOwnershipVerification | null,
  ): TargetOwnershipStatusDto {
    const verified = Boolean(row?.verifiedAt);
    return {
      verified,
      method: row?.method ?? null,
      verifiedAt: row?.verifiedAt?.toISOString() ?? null,
      lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
      lastError: (row?.lastError as LastError | null) ?? null,
      challenge: verified || !row ? null : challengeFor(target, row.token),
    };
  }

  private async audit(
    input: {
      userId: string;
      workspaceId: string;
      target: AuthorizationTargetRef;
      context?: RequestContextInput;
    },
    type: AuditEventType,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.log({
      userId: input.userId,
      type,
      ipAddress: input.context?.ipAddress ?? 'internal',
      userAgent: input.context?.userAgent ?? 'api',
      metadata: {
        workspaceId: input.workspaceId,
        targetId: input.target.id,
        targetValue: input.target.value,
        ...detail,
      },
    });
  }

  private guardOptions(): ActiveScanGuardOptions {
    return {
      allowPrivateTargets: this.configService.get('ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS', { infer: true }),
      denylist: parseSuffixList(this.configService.get('ACTIVE_SCAN_DENYLIST', { infer: true })),
      allowlist: parseSuffixList(this.configService.get('ACTIVE_SCAN_ALLOWLIST', { infer: true })),
    };
  }
}

/// 192 bits of randomness, URL-safe; the token itself is not a secret
/// credential, only proof that the publisher controls the record or page.
function newToken(): string {
  return randomBytes(24).toString('base64url');
}

function challengeFor(
  target: AuthorizationTargetRef,
  token: string,
): TargetOwnershipChallengeDto {
  const host = hostFromTarget(target.type, target.value);
  return {
    dnsRecordName: `${DNS_PREFIX}${host}`,
    dnsRecordValue: `secora-verify=${token}`,
    httpUrl: `https://${host}${HTTP_PATH}`,
    metaTag: `<meta name="secora-verify" content="${token}">`,
  };
}
