"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as billingApi from "@/lib/api/billing";
import type { CancelSubscriptionRequestDto, UpgradeSubscriptionRequestDto } from "@pentesthub/shared";

export const billingKeys = {
  plans: ["billing", "plans"] as const,
  summary: (organizationId: string) => ["billing", "summary", organizationId] as const,
  usage: (organizationId: string) => ["billing", "usage", organizationId] as const,
};

/// Plan list is public/unauthenticated-safe data (Pricing page must work
/// for a logged-out visitor too) but this hook is only ever called from
/// authenticated pages today — kept simple rather than threading a
/// `public: true` apiFetch option through for a page that doesn't exist
/// yet.
export function usePlans() {
  return useQuery({ queryKey: billingKeys.plans, queryFn: billingApi.listPlans });
}

export function useBillingSummary(organizationId: string | undefined) {
  return useQuery({
    queryKey: billingKeys.summary(organizationId ?? ""),
    queryFn: () => billingApi.getBillingSummary(organizationId as string),
    enabled: Boolean(organizationId),
  });
}

export function useUsageSummary(organizationId: string | undefined) {
  return useQuery({
    queryKey: billingKeys.usage(organizationId ?? ""),
    queryFn: () => billingApi.getUsageSummary(organizationId as string),
    enabled: Boolean(organizationId),
  });
}

export function useUpgradePlan(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpgradeSubscriptionRequestDto) => billingApi.upgradePlan(data),
    onSuccess: () => {
      if (organizationId) void queryClient.invalidateQueries({ queryKey: billingKeys.summary(organizationId) });
    },
  });
}

export function useCancelSubscription(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CancelSubscriptionRequestDto) => billingApi.cancelSubscription(data),
    onSuccess: () => {
      if (organizationId) void queryClient.invalidateQueries({ queryKey: billingKeys.summary(organizationId) });
    },
  });
}

export function useRenewSubscription(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => billingApi.renewSubscription(organizationId as string),
    onSuccess: () => {
      if (organizationId) void queryClient.invalidateQueries({ queryKey: billingKeys.summary(organizationId) });
    },
  });
}
