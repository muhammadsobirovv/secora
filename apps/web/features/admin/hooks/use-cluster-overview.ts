"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActivateLicenseRequestDto } from "@pentesthub/shared";
import * as infrastructureApi from "@/lib/api/infrastructure";

const CLUSTER_OVERVIEW_KEY = ["admin", "cluster-overview"] as const;

/// Module 14 — Admin Console. Polled rather than SSE/WebSocket-pushed —
/// same tradeoff `use-recon.ts`/`use-vuln.ts` make for active job
/// progress: this dashboard is a low-traffic operator screen, not a
/// high-frequency UI, so a plain interval is simpler than standing up a
/// dedicated push channel for it.
const CLUSTER_OVERVIEW_POLL_MS = 15_000;

export function useClusterOverview() {
  return useQuery({
    queryKey: CLUSTER_OVERVIEW_KEY,
    queryFn: infrastructureApi.getClusterOverview,
    refetchInterval: CLUSTER_OVERVIEW_POLL_MS,
  });
}

export function useActivateLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ActivateLicenseRequestDto) => infrastructureApi.activateLicense(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLUSTER_OVERVIEW_KEY }),
  });
}

export function useRevokeLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => infrastructureApi.revokeLicense(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLUSTER_OVERVIEW_KEY }),
  });
}
