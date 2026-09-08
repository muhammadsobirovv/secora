"use client";

import { useQuery } from "@tanstack/react-query";
import * as organizationsApi from "@/lib/api/organizations";

export const organizationKeys = {
  mine: ["organizations", "mine"] as const,
  detail: (id: string) => ["organizations", id] as const,
};

/// The org-discovery step every Billing UI page needs first: a
/// self-hosted/Community user may belong to zero organizations (Workspace
/// has no Organization above it), so callers must handle an empty array
/// as a normal, expected state — not an error.
export function useMyOrganizations() {
  return useQuery({ queryKey: organizationKeys.mine, queryFn: organizationsApi.listMyOrganizations });
}

export function useOrganization(organizationId: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.detail(organizationId ?? ""),
    queryFn: () => organizationsApi.getOrganization(organizationId as string),
    enabled: Boolean(organizationId),
  });
}

/// Billing/Usage pages need exactly one `organizationId` to scope requests
/// to. Module 10's Organization is optional and (unlike Workspace) this
/// platform has no "current organization" switcher anywhere yet — so this
/// picks the first organization returned by `listMyOrganizations()` (most
/// users belong to zero or one) rather than inventing an org-switcher UI
/// as a side effect of building the Billing UI. A user in more than one
/// organization is a real, disclosed limitation of this first pass — see
/// Module 19 baseline audit / final report.
export function usePrimaryOrganization() {
  const query = useMyOrganizations();
  const organizations = query.data ?? [];
  return {
    organization: organizations[0],
    organizations,
    hasMultiple: organizations.length > 1,
    isLoading: query.isLoading,
    error: query.error,
  };
}
