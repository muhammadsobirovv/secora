import { SCANNER_TARGET_TYPE_COMPATIBILITY } from '@pentesthub/shared';
import type { TargetType, VulnScanner } from '../../../prisma-types.js';

/// Thin typed wrapper over the shared compatibility table (see
/// @pentesthub/shared vuln.ts) — same split as Module 3's
/// tool-target-compatibility.ts: the frontend imports the raw shared
/// constant directly (to gray out invalid checkboxes), the backend uses
/// this typed helper (server-side is the real enforcement boundary,
/// client-side validation is never sufficient alone).
export function isScannerCompatibleWithTargetType(
  scanner: VulnScanner,
  targetType: TargetType,
): boolean {
  return SCANNER_TARGET_TYPE_COMPATIBILITY[scanner].includes(targetType);
}
