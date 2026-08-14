"use client";

import { useQuery } from "@tanstack/react-query";
import { getEvaluatedFeatureFlags } from "@/lib/api/feature-flags";

/// Module 15 — task #357. Fetches once per (workspaceId, organizationId)
/// pair and caches — a page that wants to gate a section behind a flag
/// reads `flags[key] ?? false` from this hook's result rather than
/// issuing its own request.
export function useFeatureFlags(params?: { workspaceId?: string; organizationId?: string }) {
  const query = useQuery({
    queryKey: ["feature-flags", "evaluate", params?.workspaceId ?? null, params?.organizationId ?? null],
    queryFn: () => getEvaluatedFeatureFlags(params),
  });
  return { flags: query.data?.flags ?? {}, isLoading: query.isLoading, error: query.error };
}

export function useFeatureFlag(key: string, params?: { workspaceId?: string; organizationId?: string }): boolean {
  const { flags } = useFeatureFlags(params);
  return flags[key] ?? false;
}
