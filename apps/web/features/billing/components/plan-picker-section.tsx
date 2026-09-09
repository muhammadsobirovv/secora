"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import type { PlanTier } from "@pentesthub/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePrimaryOrganization } from "@/features/organizations/hooks/use-organizations";
import { OrganizationSwitcher } from "@/features/organizations/components/organization-switcher";
import { useBillingSummary, usePlans, useUpgradePlan } from "@/features/billing/hooks/use-billing";
import { ApiError } from "@/lib/api/client";
import { NoOrganizationState } from "./no-organization-state";

function formatCurrency(amountCents: number, currency: string): string {
  if (amountCents === 0) return "Free";
  try {
    return `${new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amountCents / 100)}/mo`;
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}/mo`;
  }
}

const TIER_ORDER: PlanTier[] = ["FREE", "CLOUD_FREE", "PRO", "TEAM", "ENTERPRISE"];

export function PlanPickerSection() {
  const { organization, isLoading: orgLoading } = usePrimaryOrganization();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: summary } = useBillingSummary(organization?.id);
  const upgrade = useUpgradePlan(organization?.id);
  const [pendingTier, setPendingTier] = React.useState<PlanTier | null>(null);

  const sortedPlans = React.useMemo(() => {
    if (!plans) return [];
    return [...plans].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  }, [plans]);

  async function handleSelect(planTier: PlanTier) {
    if (!organization) return;
    setPendingTier(planTier);
    try {
      const session = await upgrade.mutateAsync({ organizationId: organization.id, planTier, useHostedCheckout: true });
      if (session.checkoutUrl) {
        // Real hosted-checkout redirect (Stripe) — this is not a fake
        // success page; navigation actually leaves for the provider's
        // real checkout session URL returned by the backend.
        window.location.href = session.checkoutUrl;
        return;
      }
      toast.success(`Switched to the ${session.subscription.plan.name} plan.`);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 403) {
        toast.error("Only an organization admin can change the plan.");
      } else {
        toast.error("Couldn't change the plan. Try again.");
      }
    } finally {
      setPendingTier(null);
    }
  }

  if (orgLoading || plansLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading plans…
      </div>
    );
  }

  if (!organization) return <NoOrganizationState />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <OrganizationSwitcher />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sortedPlans.map((plan) => {
        const isCurrent = summary?.subscription.plan.tier === plan.tier;
        const featureEntries = Object.entries(plan.features).filter(([, v]) => v !== false);
        const hasCheckoutPath = Boolean(plan.providerMetadata) || plan.priceMonthlyCents === 0;

        return (
          <Card key={plan.id} className={isCurrent ? "border-primary" : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{plan.name}</CardTitle>
                {isCurrent && <Badge variant="success">Current plan</Badge>}
              </div>
              <CardDescription>{plan.description}</CardDescription>
              <p className="pt-2 text-2xl font-semibold">{formatCurrency(plan.priceMonthlyCents, plan.currency)}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-1.5 text-sm">
                {featureEntries.length === 0 ? (
                  <li className="text-muted-foreground">Standard platform features</li>
                ) : (
                  featureEntries.map(([key]) => (
                    <li key={key} className="flex items-center gap-2">
                      <Check className="size-3.5 text-success" />
                      {key.replace(/_/g, " ")}
                    </li>
                  ))
                )}
              </ul>

              <Button
                size="sm"
                variant={isCurrent ? "outline" : "default"}
                disabled={isCurrent || pendingTier === plan.tier || !hasCheckoutPath}
                onClick={() => void handleSelect(plan.tier)}
              >
                {pendingTier === plan.tier && <Loader2 className="size-3.5 animate-spin" />}
                {isCurrent ? "Current plan" : hasCheckoutPath ? "Select plan" : "Contact us"}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {sortedPlans.length === 0 && (
        <p className="col-span-full text-sm text-muted-foreground">No plans are configured yet.</p>
      )}
      </div>
    </div>
  );
}
