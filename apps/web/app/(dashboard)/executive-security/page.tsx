"use client";

import { LineChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIncidents } from "@/features/soc/hooks/use-soc";
import {
  useOpenRemediationTasks,
  useSecurityMetricsSummary,
  useSecurityMetricsTrend,
} from "@/features/exposure/hooks/use-exposure";
import { SecurityMetricsTrendTable } from "@/features/exposure/components/security-metrics-trend-table";
import { IncidentSeverityBadge } from "@/features/soc/components/incident-badges";
import type { IncidentSeverity } from "@pentesthub/shared";

const SEVERITIES: IncidentSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

/// Module 17 — task #480. Executive Security dashboard: posture-level
/// KPIs for leadership, distinct from the analyst-facing /soc triage
/// view. Composes Security Metrics (#479), Incidents (#470), and
/// Remediation (#477) reads — same no-new-aggregate-endpoint posture as
/// every other Module 17 dashboard this session (see use-soc.ts).
export default function ExecutiveSecurityDashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useSecurityMetricsSummary(90);
  const { data: trend, isLoading: trendLoading } = useSecurityMetricsTrend(12);
  const { data: incidents, isLoading: incidentsLoading } = useIncidents({ limit: 200 });
  const { data: tasks, isLoading: tasksLoading } = useOpenRemediationTasks(200);

  const severityCounts = SEVERITIES.reduce<Record<IncidentSeverity, number>>(
    (acc, severity) => {
      acc[severity] = incidents?.filter((i) => i.severity === severity).length ?? 0;
      return acc;
    },
    { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <LineChart className="size-6" /> Executive Security
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          90-day security posture summary: response-time KPIs, incident mix, and remediation backlog.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <SummaryCard label="MTTD" value={summary?.mttdHours} suffix="h" isLoading={summaryLoading} />
        <SummaryCard label="MTTR (incident)" value={summary?.mttrIncidentHours} suffix="h" isLoading={summaryLoading} />
        <SummaryCard
          label="SLA compliance"
          value={summary?.slaComplianceRate != null ? Math.round(summary.slaComplianceRate * 100) : undefined}
          suffix="%"
          isLoading={summaryLoading}
        />
        <SummaryCard label="Open remediation" value={tasks?.length} isLoading={tasksLoading} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incidents by severity</CardTitle>
          </CardHeader>
          <CardContent>
            {incidentsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="flex flex-col gap-2">
                {SEVERITIES.map((severity) => (
                  <div key={severity} className="flex items-center justify-between">
                    <IncidentSeverityBadge severity={severity} />
                    <span className="text-sm font-medium">{severityCounts[severity]}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">12-week trend</CardTitle>
          </CardHeader>
          <CardContent>
            <SecurityMetricsTrendTable points={trend} isLoading={trendLoading} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  isLoading,
  suffix,
}: {
  label: string;
  value: number | null | undefined;
  isLoading: boolean;
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isLoading || value == null ? (
          <Skeleton className="mt-1 h-8 w-16" />
        ) : (
          <p className="mt-1 text-2xl font-semibold">
            {value.toFixed(suffix === "h" ? 1 : 0)}
            {suffix}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
