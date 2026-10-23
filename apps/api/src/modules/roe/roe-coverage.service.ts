import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../prisma/prisma-transaction.types.js';
import { assetCoversHost, findCoveringAsset, targetHost } from './roe-rules.js';

export type RoeLossReason = 'REVOKED' | 'EXPIRED' | 'NOT_YET' | 'NOT_COVERED' | 'NOT_ACTIVE' | 'MISSING';

export interface RoeCoverage {
  roeId: string;
  clientName: string;
  windowStart: Date;
  windowEnd: Date;
  approvedAt: Date | null;
  /// The scope an engagement scan may touch for this target: the covering
  /// asset, plus its subdomains only when the client allowed the wildcard.
  rule: { root: string; includeSubdomains: boolean };
}

/// Read-only question "does an approved client engagement cover this target
/// right now?" Asked at job creation, at worker start and before every
/// pipeline stage. Status is never trusted on its own: ACTIVE past its window
/// end counts as expired even if nothing has flipped the row yet.
@Injectable()
export class RoeCoverageService {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async findActiveCovering(
    target: { type: string; value: string },
    workspaceId: string,
    requestedBy: string,
    now = new Date(),
  ): Promise<RoeCoverage | null> {
    if (!targetHost(target.type, target.value)) return null;
    const rows = await this.txHost.tx.roeAuthorization.findMany({
      where: {
        workspaceId,
        // Only the person who asked for the engagement scans under it.
        requestedBy,
        status: 'ACTIVE',
        windowStart: { lte: now },
        windowEnd: { gt: now },
      },
      include: { assets: true },
      orderBy: { approvedAt: 'desc' },
    });
    for (const row of rows) {
      const asset = findCoveringAsset(row.assets, target.type, target.value);
      if (asset) return toCoverage(row, asset);
    }
    return null;
  }

  /// Re-checks one specific engagement for a running or queued scan.
  async assertStillValid(
    roeId: string,
    target: { type: string; value: string },
    now = new Date(),
  ): Promise<{ ok: true; coverage: RoeCoverage } | { ok: false; reason: RoeLossReason }> {
    const row = await this.txHost.tx.roeAuthorization.findUnique({
      where: { id: roeId },
      include: { assets: true },
    });
    if (!row) return { ok: false, reason: 'MISSING' };
    if (row.status === 'REVOKED') return { ok: false, reason: 'REVOKED' };
    if (row.status !== 'ACTIVE') return { ok: false, reason: 'NOT_ACTIVE' };
    if (row.windowEnd <= now) return { ok: false, reason: 'EXPIRED' };
    if (row.windowStart > now) return { ok: false, reason: 'NOT_YET' };
    const asset = findCoveringAsset(row.assets, target.type, target.value);
    if (!asset) return { ok: false, reason: 'NOT_COVERED' };
    return { ok: true, coverage: toCoverage(row, asset) };
  }
}

function toCoverage(
  row: { id: string; clientName: string; windowStart: Date; windowEnd: Date; approvedAt: Date | null },
  asset: { host: string; type: string; wildcard: boolean },
): RoeCoverage {
  return {
    roeId: row.id,
    clientName: row.clientName,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    approvedAt: row.approvedAt,
    rule: { root: asset.host, includeSubdomains: asset.wildcard && asset.type !== 'URL' },
  };
}

export const ROE_LOSS_MESSAGES: Record<RoeLossReason, string> = {
  REVOKED: 'The client withdrew their approval. The scan was stopped; results found so far are kept.',
  EXPIRED: 'The test window of the client authorization ended. The scan was stopped; results found so far are kept.',
  NOT_YET: 'The test window of the client authorization has not started yet.',
  NOT_COVERED: 'The client authorization no longer covers this target.',
  NOT_ACTIVE: 'The client authorization is no longer active. The scan was stopped; results found so far are kept.',
  MISSING: 'The client authorization could not be found. The scan was stopped; results found so far are kept.',
};

export { assetCoversHost };
