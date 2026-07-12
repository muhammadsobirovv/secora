import { TOOL_TARGET_TYPE_COMPATIBILITY } from '@pentesthub/shared';
import type { ReconTool, TargetType } from '../../../prisma-types.js';

/// Re-exported with a Prisma-typed signature so the backend gets real type
/// checking against TargetType — the underlying data is the single source
/// of truth shared with the frontend (packages/shared/src/recon.ts),
/// never duplicated.
export function isToolCompatibleWithTargetType(
  tool: ReconTool,
  targetType: TargetType,
): boolean {
  return (TOOL_TARGET_TYPE_COMPATIBILITY[tool] as TargetType[]).includes(
    targetType,
  );
}
