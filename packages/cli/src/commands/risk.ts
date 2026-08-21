import { RISK_ENDPOINTS } from '@pentesthub/shared';
import type { AssetGraphNodeType, ComputeRiskScoreRequestDto, RiskFactorSnapshotDto, RiskScoreV2ResultDto } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

/// Module 17 — CLI task #490 "risk" group. Mirrors `RiskController`'s
/// `risk/*` routes for Risk Engine v2 (task #474). `compute`'s factor
/// flags are a deliberately flat pass-through of `RiskFactorsV2Dto` —
/// see that interface's own doc comment for what each input means —
/// rather than the CLI re-deriving or validating them itself, since the
/// server is the single source of truth for the scoring formula.
export async function riskComputeCommand(args: string[]): Promise<void> {
  const findingId = flagValue(args, '--finding-id');
  const assetNodeType = flagValue(args, '--asset-node-type') as AssetGraphNodeType | undefined;
  const assetRefId = flagValue(args, '--asset-ref-id');
  const persist = args.includes('--persist');
  const factorsJson = flagValue(args, '--factors');
  const factors: Record<string, unknown> = factorsJson ? (JSON.parse(factorsJson) as Record<string, unknown>) : {};

  if (!findingId && !(assetNodeType && assetRefId)) {
    throw new Error(
      'Usage: pentesthub risk compute (--finding-id <id> | --asset-node-type <TYPE> --asset-ref-id <id>) [--persist] [--factors \'{"severity":"HIGH",...}\']',
    );
  }

  const http = buildHttpClient(loadConfig());
  const body: ComputeRiskScoreRequestDto = {
    ...factors,
    findingId,
    assetNodeType,
    assetRefId,
    persist,
  };
  const result = await http.post<RiskScoreV2ResultDto | RiskFactorSnapshotDto>(RISK_ENDPOINTS.compute(), body);
  console.log(JSON.stringify(result, null, 2));
}

export async function riskLatestForFindingCommand(args: string[]): Promise<void> {
  const findingId = args[0];
  if (!findingId) throw new Error('Usage: pentesthub risk latest-for-finding <findingId>');

  const http = buildHttpClient(loadConfig());
  const snapshot = await http.get<RiskFactorSnapshotDto | null>(RISK_ENDPOINTS.latestForFinding(findingId));
  console.log(JSON.stringify(snapshot, null, 2));
}

export async function riskHistoryForFindingCommand(args: string[]): Promise<void> {
  const findingId = args[0];
  if (!findingId) throw new Error('Usage: pentesthub risk history-for-finding <findingId>');

  const http = buildHttpClient(loadConfig());
  const history = await http.get<RiskFactorSnapshotDto[]>(RISK_ENDPOINTS.historyForFinding(findingId));
  for (const s of history) {
    console.log(`${s.computedAt}\t${s.riskScore}\t${s.riskTier}\t${s.recommendedPriority}`);
  }
}

export async function riskLatestForAssetCommand(args: string[]): Promise<void> {
  const nodeType = args[0];
  const refId = args[1];
  if (!nodeType || !refId) throw new Error('Usage: pentesthub risk latest-for-asset <nodeType> <refId>');

  const http = buildHttpClient(loadConfig());
  const snapshot = await http.get<RiskFactorSnapshotDto | null>(RISK_ENDPOINTS.latestForAsset(nodeType, refId));
  console.log(JSON.stringify(snapshot, null, 2));
}

export async function riskHistoryForAssetCommand(args: string[]): Promise<void> {
  const nodeType = args[0];
  const refId = args[1];
  if (!nodeType || !refId) throw new Error('Usage: pentesthub risk history-for-asset <nodeType> <refId>');

  const http = buildHttpClient(loadConfig());
  const history = await http.get<RiskFactorSnapshotDto[]>(RISK_ENDPOINTS.historyForAsset(nodeType, refId));
  for (const s of history) {
    console.log(`${s.computedAt}\t${s.riskScore}\t${s.riskTier}\t${s.recommendedPriority}`);
  }
}
