"use client";

import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePrimaryOrganization } from "@/features/organizations/hooks/use-organizations";

/// Module 20 — org-switcher UX audit, closing Module 19's disclosed "no
/// org-switcher UI" gap. Deliberately small: `listMyOrganizations()`
/// (`GET /enterprise/organizations`) already returns only organizations
/// the caller is an active member of (IDOR-safe, verified in the Module
/// 19 baseline audit) and `usePrimaryOrganization()` already fetches the
/// full list — this component only adds a picker over data that was
/// already being loaded, plus a persisted preference
/// (`useOrganizationStore`) for which one to show by default. No new
/// backend route, no new trust boundary: every page that uses the
/// selected `organization.id` still hits the same
/// `resolveOrganizationMembership()`-gated routes it always did.
///
/// Renders nothing when the caller belongs to zero or exactly one
/// organization — the common Community Edition / single-org case, where
/// a switcher would just be clutter.
export function OrganizationSwitcher() {
  const { organization, organizations, hasMultiple, selectOrganization } = usePrimaryOrganization();

  if (!hasMultiple || !organization) return null;

  return (
    <div className="flex items-center gap-2">
      <Building2 className="size-4 text-muted-foreground" />
      <Select value={organization.id} onValueChange={selectOrganization}>
        <SelectTrigger aria-label="Switch organization">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {organizations.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
