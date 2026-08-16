import {
  ASSET_GRAPH_ENDPOINTS,
  CHANGE_DETECTION_ENDPOINTS,
  TECHNOLOGY_ENDPOINTS,
} from "@pentesthub/shared";
import type {
  AssetGraphDto,
  AttackSurfaceSummaryDto,
  ChangeDetectionEventDto,
  TechnologyDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

// Module 16 — tasks #372-376.
export function getAssetGraph(targetId: string) {
  return apiFetch<AssetGraphDto>(ASSET_GRAPH_ENDPOINTS.forTarget(targetId));
}

export function getAttackSurface(projectId: string) {
  return apiFetch<AttackSurfaceSummaryDto>(ASSET_GRAPH_ENDPOINTS.attackSurface(projectId));
}

export function getTechnologies(targetId: string) {
  return apiFetch<TechnologyDto[]>(TECHNOLOGY_ENDPOINTS.forTarget(targetId));
}

export function getChangeEvents(targetId: string) {
  return apiFetch<ChangeDetectionEventDto[]>(CHANGE_DETECTION_ENDPOINTS.forTarget(targetId));
}
