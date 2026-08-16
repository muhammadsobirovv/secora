import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

export interface FingerprintInput {
  targetId?: string | null;
  endpoint?: string | null;
  vulnType?: string | null;
  cwe?: string | null;
  payload?: string | null;
}

/// Module 16 — task #378. Deterministic dedup fingerprint: SHA-256 over
/// target+endpoint+vulnType+cwe+a normalized payload signature (not the
/// raw payload string — two SQLi payloads that differ only by a numeric
/// literal should fingerprint the same finding). Two findings sharing a
/// fingerprint are dedup *candidates* — Module 6's Duplicate Detection
/// still confirms/links them, this never auto-merges (see
/// BugBountyFinding.fingerprint's doc comment in schema.prisma).
@Injectable()
export class FindingFingerprintService {
  compute(input: FingerprintInput): string {
    const parts = [
      input.targetId ?? '',
      (input.endpoint ?? '').trim().toLowerCase(),
      (input.vulnType ?? '').trim().toLowerCase(),
      (input.cwe ?? '').trim().toLowerCase(),
      this.normalizePayloadSignature(input.payload),
    ];
    return createHash('sha256').update(parts.join('|')).digest('hex');
  }

  /// Strips digits and quoted string literals so payloads that only
  /// differ by a literal value (e.g. `id=1' OR '1'='1` vs `id=2' OR
  /// '2'='2`) still fingerprint the same underlying vulnerability class.
  private normalizePayloadSignature(payload?: string | null): string {
    if (!payload) return '';
    return payload
      .toLowerCase()
      .replace(/'[^']*'/g, "'?'")
      .replace(/"[^"]*"/g, '"?"')
      .replace(/\d+/g, 'N')
      .trim();
  }
}
