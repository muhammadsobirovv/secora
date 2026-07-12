import type { ReconFindingType, ReconTool } from '../../../../prisma-types.js';

export interface ReconFindingInput {
  type: ReconFindingType;
  value: string;
  data: Record<string, unknown>;
  dedupKey: string;
}

export interface NormalizerContext {
  tool: ReconTool;
  targetValue: string;
}

/// Raw tool output -> the common ReconFinding shape. One per tool, so a
/// new tool needs no schema change — only a new Normalizer producing rows
/// in this shape.
export interface Normalizer {
  normalize(rawOutput: string, ctx: NormalizerContext): ReconFindingInput[];
}
