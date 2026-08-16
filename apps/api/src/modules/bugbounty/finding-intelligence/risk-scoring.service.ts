import { Injectable } from '@nestjs/common';
import type { RiskLevel, RiskScoreInputsDto, RiskScoreResultDto } from '@pentesthub/shared';

const SEVERITY_BASE: Record<string, number> = {
  INFO: 5,
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  CRITICAL: 95,
};

const EXPLOITABILITY_MULTIPLIER: Record<string, number> = {
  THEORETICAL: 0.8,
  PROOF_OF_CONCEPT: 1.0,
  FUNCTIONAL: 1.15,
  WEAPONIZED: 1.3,
};

const IMPACT_MULTIPLIER: Record<string, number> = {
  LOW: 0.85,
  MODERATE: 1.0,
  HIGH: 1.15,
  SEVERE: 1.3,
};

/// Module 16 — task #380. A transparent, deterministic weighted-average
/// formula — never an opaque ML score — so a researcher can always see
/// why a finding scored the way it did (spec's "AI Security Analyst never
/// auto-executes" posture extends to risk scoring too: this recomputes
/// from explicit inputs, nothing is learned/black-box). Base score comes
/// from severity (the field every finding already has); CVSS and EPSS
/// nudge it when present; exploitability/business-impact free-text
/// narratives apply bounded multipliers only when they match a known
/// keyword (unrecognized text is a no-op, never an error).
@Injectable()
export class RiskScoringService {
  score(inputs: RiskScoreInputsDto): RiskScoreResultDto {
    let base = SEVERITY_BASE[inputs.severity] ?? 50;

    if (inputs.cvssScore !== null && inputs.cvssScore !== undefined) {
      // CVSS is 0-10 — blend it in as a second signal, weighted evenly
      // against the severity-derived base rather than overriding it (a
      // manually-set severity can legitimately disagree with a computed
      // CVSS score, e.g. business-context escalation).
      base = (base + inputs.cvssScore * 10) / 2;
    }

    if (inputs.epss !== null && inputs.epss !== undefined) {
      // EPSS (0-1, probability of exploitation in the wild) — additive
      // boost, capped at +15 points, so a high-EPSS finding trends
      // upward without a single field dominating the whole score.
      base += Math.min(inputs.epss * 15, 15);
    }

    const exploitabilityMultiplier = inputs.exploitability
      ? (EXPLOITABILITY_MULTIPLIER[inputs.exploitability.toUpperCase().replace(/\s+/g, '_')] ?? 1)
      : 1;
    const impactMultiplier = inputs.businessImpact
      ? (IMPACT_MULTIPLIER[inputs.businessImpact.toUpperCase().replace(/\s+/g, '_')] ?? 1)
      : 1;

    let score = base * exploitabilityMultiplier * impactMultiplier;

    if (inputs.internetExposure === true) score *= 1.1;
    if (inputs.confidence !== null && inputs.confidence !== undefined) {
      // Confidence (0-1) tempers the score toward the midpoint when low —
      // a low-confidence CRITICAL finding shouldn't rank above a
      // high-confidence HIGH finding.
      score = score * inputs.confidence + 50 * (1 - inputs.confidence);
    }

    score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));

    return {
      riskScore: score,
      riskLevel: this.levelFor(score),
      inputs,
    };
  }

  private levelFor(score: number): RiskLevel {
    if (score >= 80) return 'CRITICAL';
    if (score >= 55) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }
}
