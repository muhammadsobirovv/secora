import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  LEGAL_DOCUMENTS,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  type LegalStatusDto,
} from '@pentesthub/shared';
import type { AppTransactionalAdapter } from '../../prisma/prisma-transaction.types.js';
import { Prisma } from '../../prisma-types.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuditService } from '../audit/audit.service.js';

export interface RecordAcceptanceInput {
  userId: string;
  version: string;
  ipAddress: string;
  userAgent: string;
}

/// How long a positive "has accepted the current version" answer is cached
/// in-process. Only positive answers are cached: a user who has not yet
/// accepted is re-checked on every request, so accepting takes effect
/// immediately on every API replica. A version bump is a deploy, which
/// restarts the process and clears the cache.
const ACCEPTED_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class LegalService {
  private readonly acceptedCache = new Map<string, number>();

  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
    private readonly auditService: AuditService,
  ) {}

  /// Overridable for tests (version-bump scenarios); production always
  /// uses LEGAL_VERSION from @pentesthub/shared.
  protected currentVersion(): string {
    return LEGAL_VERSION;
  }

  async getStatus(userId: string): Promise<LegalStatusDto> {
    const latest = await this.txHost.tx.legalAcceptance.findFirst({
      where: { userId },
      orderBy: { acceptedAt: 'desc' },
      select: { version: true },
    });
    const current = this.currentVersion();
    const acceptedCurrent = await this.hasAccepted(userId, current);
    return {
      currentVersion: current,
      effectiveDate: LEGAL_EFFECTIVE_DATE,
      acceptedVersion: latest?.version ?? null,
      acceptanceRequired: !acceptedCurrent,
    };
  }

  async hasAcceptedCurrentVersion(userId: string): Promise<boolean> {
    const cachedUntil = this.acceptedCache.get(userId);
    if (cachedUntil && cachedUntil > Date.now()) return true;
    const accepted = await this.hasAccepted(userId, this.currentVersion());
    if (accepted)
      this.acceptedCache.set(userId, Date.now() + ACCEPTED_CACHE_TTL_MS);
    return accepted;
  }

  /// Records acceptance of the current version. Idempotent per (user,
  /// version): accepting again returns without writing a second row or
  /// audit event. Rejects any version other than the current one, so a
  /// client can never record acceptance of text it was not shown.
  async recordAcceptance(input: RecordAcceptanceInput): Promise<void> {
    const current = this.currentVersion();
    if (input.version !== current) {
      throw new AppException(
        'LEGAL_VERSION_MISMATCH',
        `The current legal version is ${current}. Reload the page and accept the current version.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (await this.hasAccepted(input.userId, current)) {
      this.acceptedCache.set(input.userId, Date.now() + ACCEPTED_CACHE_TTL_MS);
      return;
    }

    try {
      await this.txHost.tx.legalAcceptance.create({
        data: {
          userId: input.userId,
          version: current,
          documents: [...LEGAL_DOCUMENTS],
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });
    } catch (error) {
      // Concurrent accept of the same version: the unique (userId,
      // version) constraint already holds the row — nothing to add.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }

    await this.auditService.log({
      userId: input.userId,
      type: 'LEGAL_ACCEPTED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { version: current, documents: [...LEGAL_DOCUMENTS] },
    });
    this.acceptedCache.set(input.userId, Date.now() + ACCEPTED_CACHE_TTL_MS);
  }

  private async hasAccepted(userId: string, version: string): Promise<boolean> {
    const row = await this.txHost.tx.legalAcceptance.findUnique({
      where: { userId_version: { userId, version } },
      select: { id: true },
    });
    return row !== null;
  }
}
