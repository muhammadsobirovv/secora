"use client";

import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIncidents, useSlaEvents } from "@/features/soc/hooks/use-soc";
import { useIndicators } from "@/features/intel/hooks/use-indicators";
import { IncidentsTable } from "@/features/soc/components/incidents-table";

const OPEN_LIKE_STATUSES = ["OPEN", "INVESTIGATING", "CONTAINMENT", "ERADICATION", "RECOVERY", "REOPENED"];

/// Module 17 — task #480. SOC dashboard: operational, analyst-facing
/// triage view. Composes Incidents (#470), SLA (#478), and Indicators
/// (#467) reads — no new backend aggregate, matching the Exposure
/// Management dashboard's own precedent (see use-soc.ts's doc comment).
/// Deliberately does not include MTTD/MTTR/SLA-compliance trend figures
/// (Security Metrics #479) — those are exec-facing KPIs, kept on the
/// separate /executive-security page instead.
export default function SocDashboardPage() {
  const { data: incidents, isLoading: incidentsLoading } = useIncidents({ limit: 50 });
  const { data: breachedEvents, isLoading: breachesLoading } = useSlaEvents({ breached: true });
  const { data: indicators, isLoading: indicatorsLoading } = useIndicators({ status: "ACTIVE", limit: 200 });

  const openIncidents = incidents?.filter((i) => OPEN_LIKE_STATUSES.includes(i.status));
  const criticalOpenIncidents = openIncidents?.filter((i) => i.severity === "CRITICAL");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldAlert className="size-6" /> Security Operations Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live incident, SLA, and threat-intelligence overview for this workspace&apos;s analysts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <SummaryCard label="Open incidents" value={openIncidents?.length} isLoading={incidentsLoading} />
        <SummaryCard
          label="Critical open"
          value={criticalOpenIncidents?.length}
          isLoading={incidentsLoading}
          emphasize={Boolean(criticalOpenIncidents?.length)}
        />
        <SummaryCard
          label="SLA breaches"
          value={breachedEvents?.length}
          isLoading={breachesLoading}
          emphasize={Boolean(breachedEvents?.length)}
        />
        <SummaryCard label="Active indicators" value={indicators?.length} isLoading={indicatorsLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <IncidentsTable incidents={incidents} isLoading={incidentsLoading} />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  isLoading,
  emphasize,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  emphasize?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isLoading || value === undefined ? (
          <Skeleton className="mt-1 h-8 w-16" />
        ) : (
          <p className={`mt-1 text-2xl font-semibold ${emphasize ? "text-destructive" : ""}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
