"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePrimaryOrganization } from "@/features/organizations/hooks/use-organizations";
import { useUsageSummary } from "@/features/billing/hooks/use-billing";
import { NoOrganizationState } from "./no-organization-state";

function resourceLabel(resourceType: string): string {
  return resourceType
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

/// This page is backend-authoritative by construction — it only ever
/// renders `PlanUsageSummaryEntry[]` returned by
/// `GET /usage/:organizationId/summary` (`QuotaService.getPlanUsageSummary`),
/// never a client-computed number. `UsageService.record()` is not exposed
/// over HTTP anywhere (see `usage.controller.ts`'s doc comment), so there
/// is no client-facing endpoint this page could use to fabricate usage
/// even if it wanted to.
export function UsageSummarySection() {
  const { organization, isLoading: orgLoading } = usePrimaryOrganization();
  const { data: entries, isLoading, error } = useUsageSummary(organization?.id);

  if (orgLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading your organizations…
      </div>
    );
  }

  if (!organization) return <NoOrganizationState />;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading usage…
      </div>
    );
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-destructive">Couldn&apos;t load usage data.</p>;
  }

  if (!entries || entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No metered usage recorded for this billing period yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {entries.map((entry) => {
        const limit = entry.hardLimit ?? entry.softLimit;
        const percent = entry.percentUsed;
        const isOverSoft = entry.softLimit !== null && entry.quantity >= entry.softLimit;
        const isOverHard = entry.hardLimit !== null && entry.quantity >= entry.hardLimit;

        return (
          <Card key={`${entry.resourceType}-${entry.periodType}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{resourceLabel(entry.resourceType)}</CardTitle>
                {isOverHard ? (
                  <Badge variant="destructive">Limit reached</Badge>
                ) : isOverSoft ? (
                  <Badge variant="warning">Near limit</Badge>
                ) : null}
              </div>
              <CardDescription>
                {entry.periodType === "DAILY" ? "Today" : entry.periodType === "MONTHLY" ? "This month" : "All time"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm">
                <span className="font-semibold">{entry.quantity.toLocaleString()}</span>{" "}
                <span className="text-muted-foreground">
                  {entry.unit}
                  {limit !== null ? ` / ${limit.toLocaleString()} ${entry.unit}` : " (unlimited)"}
                </span>
              </p>
              {limit !== null && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isOverHard ? "bg-destructive" : isOverSoft ? "bg-warning" : "bg-primary",
                    )}
                    style={{ width: `${Math.min(100, percent ?? 0)}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
