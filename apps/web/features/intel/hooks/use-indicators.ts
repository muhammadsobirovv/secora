"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateIndicatorRequestDto, UpdateIndicatorStatusRequestDto } from "@pentesthub/shared";
import * as threatIntelApi from "@/lib/api/threat-intel";
import type { ListIndicatorsParams } from "@/lib/api/threat-intel";

/// Module 17 — task #467 (Indicator management, frontend half). Mirrors
/// use-vuln.ts's shape: one query-key object, plain useQuery reads, and
/// useMutation writes that invalidate the whole "intel" key on success.
export const indicatorKeys = {
  all: ["intel", "indicators"] as const,
  list: (params: ListIndicatorsParams = {}) => ["intel", "indicators", "list", params] as const,
  detail: (id: string) => ["intel", "indicators", "detail", id] as const,
};

export function useIndicators(params: ListIndicatorsParams = {}) {
  return useQuery({
    queryKey: indicatorKeys.list(params),
    queryFn: () => threatIntelApi.listIndicators(params),
  });
}

export function useIndicator(id: string) {
  return useQuery({
    queryKey: indicatorKeys.detail(id),
    queryFn: () => threatIntelApi.getIndicator(id),
    enabled: Boolean(id),
  });
}

function useInvalidateIndicators() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: indicatorKeys.all });
}

export function useCreateIndicator() {
  const invalidate = useInvalidateIndicators();
  return useMutation({
    mutationFn: (data: CreateIndicatorRequestDto) => threatIntelApi.createIndicator(data),
    onSuccess: invalidate,
  });
}

export function useSetIndicatorStatus() {
  const invalidate = useInvalidateIndicators();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateIndicatorStatusRequestDto }) =>
      threatIntelApi.setIndicatorStatus(id, data),
    onSuccess: invalidate,
  });
}
