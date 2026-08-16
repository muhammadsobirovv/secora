"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAssetGraph,
  getAttackSurface,
  getChangeEvents,
  getTechnologies,
} from "@/lib/api/intelligence";

// Module 16 — tasks #372-376.
export function useAssetGraph(targetId: string) {
  return useQuery({
    queryKey: ["asset-graph", targetId],
    queryFn: () => getAssetGraph(targetId),
    enabled: !!targetId,
  });
}

export function useAttackSurface(projectId: string) {
  return useQuery({
    queryKey: ["attack-surface", projectId],
    queryFn: () => getAttackSurface(projectId),
    enabled: !!projectId,
  });
}

export function useTechnologies(targetId: string) {
  return useQuery({
    queryKey: ["technologies", targetId],
    queryFn: () => getTechnologies(targetId),
    enabled: !!targetId,
  });
}

export function useChangeEvents(targetId: string) {
  return useQuery({
    queryKey: ["change-events", targetId],
    queryFn: () => getChangeEvents(targetId),
    enabled: !!targetId,
  });
}
