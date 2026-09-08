"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, CreditCard, Loader2, ReceiptText } from "lucide-react";
import type { BillingProviderKind, SubscriptionStatus } from "@pentesthub/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePrimaryOrganization } from "@/features/organizations/hooks/use-organizations";
import { useBillingSummary, useCancelSubscription, useRenewSubscription } from "@/features/billing/hooks/use-billing";
import { NoOrganizationState } from "./no-organization-state";

function formatCurrency(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      amountCents / 100,
    );
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "outline" }> = {
  TRIALING: { label: "Trial", variant: "secondary" },
  ACTIVE: { label: "Active", variant: "success" },
  PAST_DUE: { label: "Past due", variant: "destructive" },
  CANCELED: { label: "Canceled", variant: "outline" },
  EXPIRED: { label: "Expired", variant: "outline" },
  NONE: { label: "No subscription", variant: "outline" },
};

/// Module 19 (#332). `BillingProviderKind.NONE`/`MANUAL` are real,
/// expected states for Community Edition / self-hosted orgs — this
/// section always says so plainly rather than hiding the "Upgrade"
/// button behind a checkout flow that doesn't exist for this org. See
/// `PaymentProvider`'s three adapters (Stripe/Manual/Null) in
/// `apps/api/src/modules/billing`.
const PROVIDER_COPY: Record<BillingProviderKind, string> = {
  STRIPE: "Payments are handled by Stripe.",
  MANUAL: "This organization is on manual/invoice billing — plan changes apply immediately, no card required.",
  NONE: "No payment provider is configured for this deployment. Plan changes apply immediately at no charge.",
};

export function BillingSummarySection() {
  const { organization, isLoading: orgLoading, error: orgError } = usePrimaryOrganization();
  const { data: summary, isLoading, error } = useBillingSummary(organization?.id);
  const cancel = useCancelSubscription(organization?.id);
  const renew = useRenewSubscription(organization?.id);
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  if (orgLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your organizations…
        </CardContent>
      </Card>
    );
  }

  if (orgError) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-destructive">
          Couldn&apos;t load your organizations. Try refreshing the page.
        </CardContent>
      </Card>
    );
  }

  if (!organization) return <NoOrganizationState />;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading billing summary…
        </CardContent>
      </Card>
    );
  }

  if (error || !summary) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-destructive">
          Couldn&apos;t load billing information for {organization.name}. You may not have access,
          or the request failed — try refreshing the page.
        </CardContent>
      </Card>
    );
  }

  const { subscription, paymentMethods, invoices } = summary;
  const statusBadge = STATUS_BADGE[subscription.status];

  async function handleCancel() {
    try {
      await cancel.mutateAsync({ organizationId: organization!.id, atPeriodEnd: true });
      toast.success("Subscription will cancel at the end of the current period.");
    } catch {
      toast.error("Couldn't cancel the subscription.");
    } finally {
      setConfirmCancel(false);
    }
  }

  async function handleRenew() {
    try {
      await renew.mutateAsync();
      toast.success("Subscription reactivated.");
    } catch {
      toast.error("Couldn't reactivate the subscription.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{organization.name}</CardTitle>
            <CardDescription>{PROVIDER_COPY[subscription.provider]}</CardDescription>
          </div>
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {subscription.status === "PAST_DUE" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Your last payment failed. Some features may be restricted until this is resolved.
                {subscription.provider === "STRIPE" && " Check your payment method with your provider."}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="text-sm font-medium">{subscription.plan.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current period</p>
              <p className="text-sm font-medium">
                {formatDate(subscription.currentPeriodStart)} – {formatDate(subscription.currentPeriodEnd)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Price</p>
              <p className="text-sm font-medium">
                {subscription.plan.priceMonthlyCents === 0
                  ? "Free"
                  : `${formatCurrency(subscription.plan.priceMonthlyCents, subscription.plan.currency)}/mo`}
              </p>
            </div>
          </div>

          {subscription.cancelAtPeriodEnd && (
            <p className="text-xs text-muted-foreground">
              This subscription is set to cancel on {formatDate(subscription.currentPeriodEnd)}.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/pricing">Change plan</Link>
            </Button>
            {subscription.cancelAtPeriodEnd ? (
              <Button size="sm" variant="outline" onClick={() => void handleRenew()} disabled={renew.isPending}>
                {renew.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Undo cancellation
              </Button>
            ) : (
              subscription.status !== "NONE" &&
              subscription.plan.priceMonthlyCents > 0 && (
                <Button size="sm" variant="outline" onClick={() => setConfirmCancel(true)} disabled={cancel.isPending}>
                  Cancel subscription
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" /> Payment methods
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paymentMethods.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {subscription.provider === "STRIPE"
                ? "No payment method on file."
                : "This billing provider doesn't use stored payment methods."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {paymentMethods.map((pm) => (
                <li key={pm.id} className="flex items-center justify-between text-sm">
                  <span>
                    {pm.brand ?? "Card"} •••• {pm.last4 ?? "····"}
                    {pm.expMonth && pm.expYear ? ` — expires ${pm.expMonth}/${pm.expYear}` : ""}
                  </span>
                  {pm.isDefault && <Badge variant="secondary">Default</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="size-4" /> Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {invoices.map((invoice, i) => (
                <React.Fragment key={invoice.id}>
                  {i > 0 && <Separator />}
                  <li className="flex items-center justify-between py-1 text-sm">
                    <span>
                      {formatDate(invoice.issuedAt)} — {formatCurrency(invoice.amountCents, invoice.currency)}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          invoice.status === "PAID"
                            ? "success"
                            : invoice.status === "OPEN"
                              ? "warning"
                              : invoice.status === "UNCOLLECTIBLE"
                                ? "destructive"
                                : "outline"
                        }
                      >
                        {invoice.status}
                      </Badge>
                      {invoice.hostedInvoiceUrl && (
                        <a
                          href={invoice.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          View
                        </a>
                      )}
                    </div>
                  </li>
                </React.Fragment>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              {organization.name} will stay on the {subscription.plan.name} plan until{" "}
              {formatDate(subscription.currentPeriodEnd)}, then revert to the free plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleCancel()}
            >
              Cancel subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
