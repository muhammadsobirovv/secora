"use client";

import { useQuery } from "@tanstack/react-query";
import * as organizationsApi from "@/lib/api/organizations";
import { useOrganizationStore } from "@/lib/stores/organization-store";

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
/// to. Module 20 (org-switcher UX audit, following up on Module 19's
/// disclosed "no org-switcher UI" gap): a user's choice of "which of my
/// organizations am I looking at" is now a persisted UI preference
/// (`useOrganizationStore`), not always just "the first one returned."
/// The persisted ID is never trusted blindly — it's only used if it's
/// actually present in this call's real `listMyOrganizations()` result,
/// so a stale ID (the org was left, deleted, or this is a different
/// account in the same browser) silently and safely falls back to the
/// first organization rather than showing nothing or an error.
export function usePrimaryOrganization() {
  const query = useMyOrganizations();
  const organizations = query.data ?? [];
  const selectedId = useOrganizationStore((s) => s.selectedOrganizationId);
  const setSelectedOrganizationId = useOrganizationStore((s) => s.setSelectedOrganizationId);

  const selected = selectedId ? organizations.find((o) => o.id === selectedId) : undefined;
  const organization = selected ?? organizations[0];

  return {
    organization,
    organizations,
    hasMultiple: organizations.length > 1,
    isLoading: query.isLoading,
    error: query.error,
    selectOrganization: setSelectedOrganizationId,
  };
}
