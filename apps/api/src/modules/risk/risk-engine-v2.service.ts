import { Injectable } from '@nestjs/common';
import type {
  AssetGraphNodeType,
  BusinessCriticality,
  RemediationPriority,
  RiskFactorSnapshotDto,
  RiskFactorsV2Dto,
  RiskScoreV2ResultDto,
  RiskTier,
} from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RiskScoringService } from '../bugbounty/finding-intelligence/risk-scoring.service.js';

interface RiskFactorSnapshotRow {
  id: string;
  workspaceId: string;
  findingId: string | null;
  assetNodeType: string | null;
  assetRefId: string | null;
  riskScore: number;
  riskTier: string;
  factors: unknown;
  computedAt: Date | string;
}

/// Amount added/subtracted for each `BusinessCriticality` level — a
/// LOW-criticality asset's risk trends down, a CRITICAL one trends up,
/// same transparent-bounded-adjustment style as v1's own multipliers.
const CRITICALITY_ADJUSTMENT: Record<BusinessCriticality, number> = {
  LOW: -8,
  MEDIUM: 0,
  HIGH: 8,
  CRITICAL: 15,
};

function tierFor(score: number): RiskTier {
  if (score >= 85) return 'CRITICAL';
  if (score >= 65) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score >= 15) return 'LOW';
  return 'INFORMATIONAL';
}

function priorityForTier(tier: RiskTier): RemediationPriority {
  switch (tier) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'HIGH':
      return 'HIGH';
    case 'MEDIUM':
      return 'MEDIUM';
    default:
      // LOW and INFORMATIONAL both recommend LOW priority — there is no
      // "informational" remediation-priority level (RemediationPriority
      // is 4-valued, RiskTier is 5-valued; INFORMATIONAL findings are
      // rarely worth a tracked remediation task at all, but if one exists
      // it's still triaged as LOW, not silently dropped).
      return 'LOW';
  }
}

function toSnapshotDto(row: RiskFactorSnapshotRow): RiskFactorSnapshotDto {
  const riskTier = row.riskTier as RiskTier;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    findingId: row.findingId,
    assetNodeType: row.assetNodeType as AssetGraphNodeType | null,
    assetRefId: row.assetRefId,
    riskScore: row.riskScore,
    riskTier,
    recommendedPriority: priorityForTier(riskTier),
    factors: (row.factors as RiskFactorsV2Dto | null) ?? {},
    computedAt: new Date(row.computedAt).toISOString(),
  };
}

/// Module 17 — task #474/#475 (Risk Engine v2 + Risk prioritization,
/// spec sections 18-19). Explicitly "extend, don't replace": the base
/// severity/CVSS/EPSS/exploitability/businessImpact/internetExposure/
/// confidence formula stays exactly `RiskScoringService.score()` (Module
/// 16, task #380) unmodified — this service calls it first, then layers
/// bounded, transparent v2 adjustments on top (KEV status, asset
/// criticality, technology/finding confidence damping, threat-intel
/// relevance, unremediated age, remediation status) rather than
/// reimplementing or overriding the v1 math. Every adjustment is a fixed,
/// disclosed bound — never an opaque/ML score — matching v1's own
/// transparency requirement and the platform's "AI must not silently
/// change severity" constraint (a human or the AI Security Analyst reads
/// `factors` back, same idea as v1's `RiskScoreResultDto.inputs`).
///
/// `RiskFactorSnapshot` (Module 17 schema addition) is the persisted,
/// append-only record of a score actually being recorded — never a
/// mutable "current score" column (see that model's own doc comment) —
/// so history is always a query, and "why did this score this way" stays
/// answerable from any past row, not just the latest one.
@Injectable()
export class RiskEngineV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly baseScoring: RiskScoringService,
  ) {}

  private get snapshotTable() {
    return (
      this.prisma as unknown as {
        riskFactorSnapshot: {
          create: (args: unknown) => Promise<RiskFactorSnapshotRow>;
          findFirst: (args: unknown) => Promise<RiskFactorSnapshotRow | null>;
          findMany: (args: unknown) => Promise<RiskFactorSnapshotRow[]>;
        };
      }
    ).riskFactorSnapshot;
  }

  compute(factors: RiskFactorsV2Dto): RiskScoreV2ResultDto {
    const base = this.baseScoring.score({
      severity: factors.severity ?? 'MEDIUM',
      cvssScore: factors.cvssScore ?? null,
      epss: factors.epss ?? null,
      assetCriticality: null,
      internetExposure: factors.internetExposure ?? null,
      confidence: factors.findingConfidence ?? null,
      exploitability: factors.exploitability ?? null,
      businessImpact: factors.businessImpact ?? null,
      historicalActivityScore: null,
    });

    let score = base.riskScore;

    // Known Exploited Vulnerability — the single strongest real-world
    // exploitation signal available; bounded +20 so it can escalate a
    // MEDIUM into HIGH/CRITICAL territory but never single-handedly force
    // 100 regardless of everything else.
    if (factors.isKnownExploited) {
      score = Math.min(100, score + 20);
    }

    if (factors.assetCriticality) {
      score = Math.min(100, Math.max(0, score + CRITICALITY_ADJUSTMENT[factors.assetCriticality]));
    }

    // Low-confidence technology fingerprinting dampens the score toward
    // the midpoint, mirroring v1's own `confidence` damping — a finding
    // resting on a shaky tech-detection shouldn't rank as high as one
    // resting on a certain one. Bounded pull: at confidence 1.0 the score
    // is untouched; at confidence 0.0 it's pulled 30% of the way toward
    // 50 (a weaker, secondary signal — `findingConfidence` above already
    // covers the stronger, finding-level case via the base v1 formula).
    if (factors.technologyConfidence !== undefined) {
      const c = Math.min(1, Math.max(0, factors.technologyConfidence));
      score = score - (score - 50) * (1 - c) * 0.3;
    }

    if (factors.threatIntelSignal !== undefined) {
      // ThreatMatch confidence (0-1, already capped below 0.9 at the
      // source — see `ThreatMatchService.MAX_CONFIDENCE`) — bounded +10.
      score = Math.min(100, score + Math.min(Math.max(factors.threatIntelSignal, 0) * 10, 10));
    }

    if (factors.ageDays !== undefined && factors.ageDays > 30) {
      // Unremediated risk creeping past a month starts to matter more —
      // capped at +10 so an old LOW severity finding still can't outrank
      // a fresh CRITICAL one.
      score = Math.min(100, score + Math.min((factors.ageDays - 30) / 10, 10));
    }

    if (factors.remediationStatus === 'IN_PROGRESS') {
      score = Math.max(0, score - 5);
    } else if (factors.remediationStatus === 'BLOCKED') {
      score = Math.min(100, score + 5);
    }

    score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));
    const riskTier = tierFor(score);

    return {
      riskScore: score,
      riskTier,
      recommendedPriority: priorityForTier(riskTier),
      factors,
    };
  }

  async recordSnapshot(
    workspaceId: string,
    target: { findingId?: string; assetNodeType?: AssetGraphNodeType; assetRefId?: string },
    factors: RiskFactorsV2Dto,
    computedBy?: string,
  ): Promise<RiskFactorSnapshotDto> {
    const result = this.compute(factors);
    const row = await this.snapshotTable.create({
      data: {
        workspaceId,
        findingId: target.findingId ?? null,
        assetNodeType: target.assetNodeType ?? null,
        assetRefId: target.assetRefId ?? null,
        riskScore: result.riskScore,
        riskTier: result.riskTier,
        factors: result.factors,
        computedBy: computedBy ?? null,
      },
    });
    return toSnapshotDto(row);
  }

  async latestForFinding(workspaceId: string, findingId: string): Promise<RiskFactorSnapshotDto | null> {
    const row = await this.snapshotTable.findFirst({ where: { workspaceId, findingId }, orderBy: { computedAt: 'desc' } });
    return row ? toSnapshotDto(row) : null;
  }

  async historyForFinding(workspaceId: string, findingId: string, limit = 50): Promise<RiskFactorSnapshotDto[]> {
    const rows = await this.snapshotTable.findMany({
      where: { workspaceId, findingId },
      orderBy: { computedAt: 'desc' },
      take: limit,
    });
    return rows.map(toSnapshotDto);
  }

  async latestForAsset(workspaceId: string, assetNodeType: AssetGraphNodeType, assetRefId: string): Promise<RiskFactorSnapshotDto | null> {
    const row = await this.snapshotTable.findFirst({ where: { workspaceId, assetNodeType, assetRefId }, orderBy: { computedAt: 'desc' } });
    return row ? toSnapshotDto(row) : null;
  }

  async historyForAsset(workspaceId: string, assetNodeType: AssetGraphNodeType, assetRefId: string, limit = 50): Promise<RiskFactorSnapshotDto[]> {
    const rows = await this.snapshotTable.findMany({
      where: { workspaceId, assetNodeType, assetRefId },
      orderBy: { computedAt: 'desc' },
      take: limit,
    });
    return rows.map(toSnapshotDto);
  }
}
