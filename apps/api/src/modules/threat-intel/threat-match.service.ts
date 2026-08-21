import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { AssetGraphNodeType, ThreatMatchAnalystStatus, ThreatMatchDto } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IndicatorMatchedEvent } from './events/indicator-matched.event.js';

interface AssetNodeRow {
  id: string;
  nodeType: string;
  refId: string;
}

interface IndicatorRow {
  id: string;
  type: string;
  value: string;
  confidence: number;
}

interface ThreatMatchRow {
  id: string;
  workspaceId: string;
  projectId: string | null;
  targetId: string | null;
  indicatorId: string;
  assetNodeType: string | null;
  assetRefId: string | null;
  findingId: string | null;
  confidence: number;
  source: string;
  evidence: unknown;
  analystStatus: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function toDto(row: ThreatMatchRow): ThreatMatchDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    targetId: row.targetId,
    indicatorId: row.indicatorId,
    assetNodeType: row.assetNodeType as AssetGraphNodeType | null,
    assetRefId: row.assetRefId,
    findingId: row.findingId,
    confidence: row.confidence,
    source: row.source,
    evidence: (row.evidence as Record<string, unknown> | null) ?? null,
    analystStatus: row.analystStatus as ThreatMatchAnalystStatus,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/// Which `AssetGraphNodeType`s an `IndicatorType` can be exactly-value-
/// matched against — an exact IP/domain/URL/certificate-hash equality is
/// a much stronger signal than the fuzzy name-in-CPE/description matching
/// `VulnerabilityMatchingService` does for CVEs, so confidence here starts
/// higher — but per spec section 10 ("do NOT automatically declare
/// compromise") it is still always capped below 1.0 and `analystStatus`
/// always starts at `NEW`, never auto-`CONFIRMED`.
const TYPE_TO_ASSET_NODE_TYPES: Partial<Record<string, string[]>> = {
  IP: ['IP'],
  DOMAIN: ['DOMAIN', 'SUBDOMAIN'],
  URL: ['URL'],
  CERTIFICATE: ['CERTIFICATE'],
};
const MAX_CONFIDENCE = 0.9;
const ASSET_SCAN_LIMIT = 5000;
const INDICATOR_SCAN_LIMIT = 5000;

/// Module 17 — task #469 (Threat Intelligence correlation, spec section
/// 10). This domain's `VulnerabilityMatchingService`/`CveMatch`
/// equivalent — see that service's class doc comment for the shared
/// design rationale (deterministic, evidence-carrying, never auto-
/// promoted). Correlates the `Indicator` cache (global + this workspace's
/// private rows) against `AssetGraphNode` rows for a target by *exact*
/// value match on IP/domain/URL/certificate-hash — never a fuzzy/
/// substring match, since indicator values are precise IOCs, not free-text
/// technology names.
@Injectable()
export class ThreatMatchService {
  private readonly logger = new Logger(ThreatMatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  private get assetRepo() {
    return (this.prisma as unknown as { assetGraphNode: { findMany: (args: unknown) => Promise<AssetNodeRow[]> } }).assetGraphNode;
  }
  private get indicatorRepo() {
    return (this.prisma as unknown as { indicator: { findMany: (args: unknown) => Promise<IndicatorRow[]> } }).indicator;
  }
  private get matchRepo() {
    return (
      this.prisma as unknown as {
        threatMatch: {
          findFirst: (args: unknown) => Promise<ThreatMatchRow | null>;
          create: (args: unknown) => Promise<ThreatMatchRow>;
          update: (args: unknown) => Promise<ThreatMatchRow>;
          findMany: (args: unknown) => Promise<ThreatMatchRow[]>;
          findUnique: (args: unknown) => Promise<ThreatMatchRow | null>;
        };
      }
    ).threatMatch;
  }

  /// Best-effort by design (mirrors `VulnerabilityMatchingService.runForTarget`)
  /// — called from the same Recon-completion event handler
  /// (`ReconJobCompletedIntelligenceHandler`, wired in `IntelligenceModule`),
  /// and a failure here must never affect the Recon job's own result.
  async runForTarget(workspaceId: string, projectId: string, targetId: string): Promise<number> {
    const assetNodes = await this.assetRepo.findMany({
      where: { targetId, nodeType: { in: ['IP', 'DOMAIN', 'SUBDOMAIN', 'URL', 'CERTIFICATE'] } },
      take: ASSET_SCAN_LIMIT,
    });
    if (assetNodes.length === 0) return 0;

    const indicatorTypes = Object.keys(TYPE_TO_ASSET_NODE_TYPES);
    const indicators = await this.indicatorRepo.findMany({
      where: { type: { in: indicatorTypes }, status: 'ACTIVE', OR: [{ workspaceId }, { workspaceId: null }] },
      take: INDICATOR_SCAN_LIMIT,
    });
    if (indicators.length === 0) {
      this.logger.debug(`Threat match for target ${targetId}: no ACTIVE IP/DOMAIN/URL/CERTIFICATE indicators cached — 0 candidates possible.`);
      return 0;
    }

    // Exact-value lookup map, keyed by normalized value — O(assets +
    // indicators) instead of the O(assets * indicators) nested-loop
    // `VulnerabilityMatchingService` uses for its necessarily-fuzzy CVE
    // matching (exact equality lets us do this safely).
    const indicatorsByValue = new Map<string, IndicatorRow[]>();
    for (const ind of indicators) {
      const key = ind.value.trim().toLowerCase();
      const bucket = indicatorsByValue.get(key) ?? [];
      bucket.push(ind);
      indicatorsByValue.set(key, bucket);
    }

    let written = 0;
    for (const node of assetNodes) {
      const key = node.refId.trim().toLowerCase();
      const candidates = (indicatorsByValue.get(key) ?? []).filter((ind) =>
        (TYPE_TO_ASSET_NODE_TYPES[ind.type] ?? []).includes(node.nodeType),
      );
      for (const indicator of candidates) {
        await this.upsertMatch(workspaceId, projectId, targetId, node, indicator);
        written += 1;
      }
    }

    this.logger.log(`Threat match for target ${targetId}: ${written} candidate match(es) recorded across ${assetNodes.length} asset node(s).`);
    return written;
  }

  async listMatchesForTarget(targetId: string): Promise<ThreatMatchDto[]> {
    const rows = await this.matchRepo.findMany({ where: { targetId }, orderBy: { confidence: 'desc' }, take: 200 });
    return rows.map(toDto);
  }

  async setAnalystStatus(id: string, workspaceId: string, status: ThreatMatchAnalystStatus): Promise<ThreatMatchDto> {
    const row = await this.matchRepo.findUnique({ where: { id } });
    if (!row || row.workspaceId !== workspaceId) {
      throw new AppException('THREAT_MATCH_NOT_FOUND', 'Threat match not found.', HttpStatus.NOT_FOUND);
    }
    const updated = await this.matchRepo.update({ where: { id }, data: { analystStatus: status } });
    return toDto(updated);
  }

  private async upsertMatch(
    workspaceId: string,
    projectId: string,
    targetId: string,
    node: AssetNodeRow,
    indicator: IndicatorRow,
  ): Promise<void> {
    const confidence = Math.min(MAX_CONFIDENCE, Math.max(0.05, indicator.confidence + 0.2));
    const evidence = {
      matchType: 'EXACT_VALUE_MATCH',
      indicatorValue: indicator.value,
      indicatorType: indicator.type,
      indicatorBaseConfidence: indicator.confidence,
      assetNodeType: node.nodeType,
      assetRefId: node.refId,
      reasons: [
        `Asset graph node ${node.nodeType}:${node.refId} exactly matches indicator ${indicator.type}:${indicator.value}.`,
        'Exact-value match is a strong signal but is not, on its own, confirmed compromise — see analystStatus.',
      ],
    };

    const existing = await this.matchRepo.findFirst({ where: { indicatorId: indicator.id, assetNodeType: node.nodeType, assetRefId: node.refId, targetId } });
    if (existing) {
      await this.matchRepo.update({ where: { id: existing.id }, data: { confidence, evidence } });
      return;
    }
    const created = await this.matchRepo.create({
      data: {
        workspaceId,
        projectId,
        targetId,
        indicatorId: indicator.id,
        assetNodeType: node.nodeType,
        assetRefId: node.refId,
        confidence,
        source: 'THREAT_MATCH_ENGINE',
        evidence,
      },
    });

    // Module 17 — task #487 (Automation rules engine). Only on genuine
    // creation — see `IndicatorMatchedEvent`'s own doc comment. Best-
    // effort: the ThreatMatch row above is already durably recorded
    // either way.
    try {
      this.eventBus.publish(new IndicatorMatchedEvent(workspaceId, created.id, indicator.type, confidence, targetId));
    } catch (error: unknown) {
      this.logger.warn(`Failed to publish IndicatorMatchedEvent for ThreatMatch ${created.id}: ${String(error)}`);
    }
  }
}
