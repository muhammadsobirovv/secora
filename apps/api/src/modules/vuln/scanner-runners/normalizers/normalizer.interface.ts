import type {
  OwaspCategory,
  VulnFindingConfidence,
  VulnFindingSeverity,
  VulnScanner,
} from '../../../../prisma-types.js';

/// Everything a Normalizer produces for one match — a strict subset of the
/// VulnFinding columns the execution service needs (evidence
/// text/attachment is materialized separately, by the execution service,
/// not here — a Normalizer never touches the database). `evidence` holds
/// the *raw text* for each optional evidence kind the scanner captured;
/// the execution service turns present entries into real Evidence rows.
export interface VulnFindingInput {
  title: string;
  description: string;
  severity: VulnFindingSeverity;
  cvssScore: number | null;
  cvssVector: string | null;
  cwe: string | null;
  owaspCategory: OwaspCategory | null;
  scannerVersion: string | null;
  confidence: VulnFindingConfidence;
  vulnType: string;
  path: string | null;
  signature: string;
  matchedAt: string;
  data: Record<string, unknown>;
  dedupKey: string;
  tags: string[];
  references: string[];
  evidence: {
    request?: string;
    response?: string;
    payload?: string;
    command?: string;
  };
}

export interface NormalizerContext {
  scanner: VulnScanner;
  targetValue: string;
}

/// Raw scanner output -> the common VulnFindingInput shape. One per
/// scanner, so a new scanner needs no schema change — only a new
/// Normalizer producing rows in this shape. Mirrors Module 3's Normalizer
/// contract exactly.
export interface Normalizer {
  normalize(rawOutput: string, ctx: NormalizerContext): VulnFindingInput[];
}
