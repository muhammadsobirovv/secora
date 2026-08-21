"use client";

import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useOpenRemediationTasks,
  useSecurityMetricsSummary,
  useSecurityMetricsTrend,
} from "@/features/exposure/hooks/use-exposure";
import { RemediationTasksTable } from "@/features/exposure/components/remediation-tasks-table";
import { SecurityMetricsTrendTable } from "@/features/exposure/components/security-metrics-trend-table";

/// Module 17 — task #476. Exposure Management landing page: composes the
/// already-shipped Remediation (#477) and Security Metrics (#479) reads
/// into one workspace-wide view, mirroring VulnDashboardPage's layout
/// (header -> stat-card row -> two-up detail cards -> full-width table).
/// No dedicated "risk snapshot browser" section here — the Risk endpoints
/// (#478) are per-finding/per-asset lookups only, with no bulk-list route
/// yet, so risk detail stays reachable from Findings/Assets pages rather
/// than being faked here with a client-side aggregate.
export default function ExposureManagementPage() {
  const { data: summary, isLoading: summaryLoading } = useSecurityMetricsSummary(30);
  const { data: tasks, isLoading: tasksLoading } = useOpenRemediationTasks(50);
  const { data: trend, isLoading: trendLoading } = useSecurityMetricsTrend(8);

  const overdueCount = tasks?.filter((task) => {
    if (!task.dueDate) return false;
    if (!["OPEN", "IN_PROGRESS", "BLOCKED", "READY_FOR_VERIFICATION"].includes(task.status)) return false;
    return new Date(task.dueDate).getTime() < Date.now();
  }).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Gauge className="size-6" /> Exposure Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Remediation progress and response-time metrics across the workspace, last 30 days.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Open remediation tasks" value={tasks?.length} isLoading={tasksLoading} />
        <SummaryCard label="Overdue tasks" value={overdueCount} isLoading={tasksLoading} />
        <SummaryCard
          label="SLA compliance"
          value={
            summary?.slaComplianceRate != null ? Math.round(summary.slaComplianceRate * 100) : undefined
          }
          suffix="%"
          isLoading={summaryLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Response-time metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading || !summary ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <MetricStat label="MTTD" value={summary.mttdHours} sampleSize={summary.mttdSampleSize} />
                <MetricStat
                  label="MTTR (incident)"
                  value={summary.mttrIncidentHours}
                  sampleSize={summary.mttrIncidentSampleSize}
                />
                <MetricStat
                  label="MTTR (remediation)"
                  value={summary.mttrRemediationHours}
                  sampleSize={summary.mttrRemediationSampleSize}
                />
                <MetricStat label="MTTV" value={summary.mttvHours} sampleSize={summary.mttvSampleSize} />
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly trend</CardTitle>
          </CardHeader>
          <CardContent>
            <SecurityMetricsTrendTable points={trend} isLoading={trendLoading} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open remediation tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <RemediationTasksTable tasks={tasks} isLoading={tasksLoading} />
        </CardContent>
      </Card>
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
  value: number | undefined;
  isLoading: boolean;
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isLoading || value === undefined ? (
          <Skeleton className="mt-1 h-8 w-16" />
        ) : (
          <p className="mt-1 text-2xl font-semibold">
            {value}
            {suffix}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MetricStat({
  label,
  value,
  sampleSize,
}: {
  label: string;
  value: number | null | undefined;
  sampleSize: number | undefined;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">
        {value != null ? `${value.toFixed(1)}h` : "—"}
        {sampleSize ? <span className="ml-1 text-xs text-muted-foreground">(n={sampleSize})</span> : null}
      </dd>
    </div>
  );
}
