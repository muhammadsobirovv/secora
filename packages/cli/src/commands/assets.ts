import { ASSET_GRAPH_ENDPOINTS, TECHNOLOGY_ENDPOINTS } from '@pentesthub/shared';
import type { AssetGraphDto, AttackSurfaceSummaryDto, TechnologyDto } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

/// Module 17 — CLI task #490 "assets" group. Deliberately reuses Module
/// 16's `ASSET_GRAPH_ENDPOINTS`/`TECHNOLOGY_ENDPOINTS` (see
/// `module16-endpoints.ts`) rather than declaring a parallel Module 17
/// "assets" endpoint catalog — same underlying `AssetGraph`/`Technology`
/// data every other Module 17 surface (Knowledge Graph, Incident asset
/// links, Remediation asset links) already points back at.

export async function assetsGraphCommand(args: string[]): Promise<void> {
  const targetId = args[0];
  if (!targetId) throw new Error('Usage: pentesthub assets graph <targetId>');

  const http = buildHttpClient(loadConfig());
  const graph = await http.get<AssetGraphDto>(ASSET_GRAPH_ENDPOINTS.forTarget(targetId));
  console.log(JSON.stringify(graph, null, 2));
}

export async function assetsAttackSurfaceCommand(args: string[]): Promise<void> {
  const projectId = args[0];
  if (!projectId) throw new Error('Usage: pentesthub assets attack-surface <projectId>');

  const http = buildHttpClient(loadConfig());
  const summary = await http.get<AttackSurfaceSummaryDto>(ASSET_GRAPH_ENDPOINTS.attackSurface(projectId));
  console.log(JSON.stringify(summary, null, 2));
}

export async function assetsTechnologiesCommand(args: string[]): Promise<void> {
  const targetId = args[0];
  if (!targetId) throw new Error('Usage: pentesthub assets technologies <targetId>');

  const http = buildHttpClient(loadConfig());
  const technologies = await http.get<TechnologyDto[]>(TECHNOLOGY_ENDPOINTS.forTarget(targetId));
  for (const t of technologies) {
    console.log(`${t.id}\t${t.name}\t${t.category}\t${t.confidence}`);
  }
}
