import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/// Shared empty state for every Billing/Usage/Pricing surface: Organization
/// (Module 10) is an OPTIONAL layer above Workspace, so a self-hosted or
/// Community Edition user commonly has zero organizations — this is the
/// expected, common case, not an error. Billing/Subscription/Invoice are
/// all keyed on `organizationId`, so there is genuinely nothing to show
/// until one exists.
export function NoOrganizationState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Building2 className="size-8 text-muted-foreground" />
        <div className="max-w-md space-y-1">
          <p className="text-sm font-medium">No organization yet</p>
          <p className="text-sm text-muted-foreground">
            Billing, plans, and usage limits are managed at the organization level. You&apos;re
            currently using PentestHub AI as a self-hosted Community Edition workspace with no
            organization attached — every core feature works without one. Create or join an
            organization to manage a paid subscription.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
