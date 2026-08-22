import { ASSET_GRAPH_ENDPOINTS, TECHNOLOGY_ENDPOINTS } from '@pentesthub/shared';
import type { AssetGraphDto, AttackSurfaceSummaryDto, TechnologyDto } from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 17 — "assets" resource (task #491). Deliberately reuses
/// Module 16's `ASSET_GRAPH_ENDPOINTS`/`TECHNOLOGY_ENDPOINTS` — see
/// `packages/cli/src/commands/assets.ts`'s own doc comment for why no
/// parallel Module 17 endpoint catalog exists for this surface.
export class AssetsResource {
  constructor(private readonly http: HttpClient) {}

  graph(targetId: string): Promise<AssetGraphDto> {
    return this.http.get<AssetGraphDto>(ASSET_GRAPH_ENDPOINTS.forTarget(targetId));
  }

  attackSurface(projectId: string): Promise<AttackSurfaceSummaryDto> {
    return this.http.get<AttackSurfaceSummaryDto>(ASSET_GRAPH_ENDPOINTS.attackSurface(projectId));
  }

  technologies(targetId: string): Promise<TechnologyDto[]> {
    return this.http.get<TechnologyDto[]>(TECHNOLOGY_ENDPOINTS.forTarget(targetId));
  }
}
