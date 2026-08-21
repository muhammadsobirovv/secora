"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { FileBarChart } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useSecurityReport } from "@/features/security-reports/hooks/use-security-reports";
import { SecurityReportTypeBadge } from "@/features/security-reports/components/security-report-type-badge";
import { IncidentSeverityBadge, IncidentStatusBadge } from "@/features/soc/components/incident-badges";
import { IndicatorTypeBadge } from "@/features/intel/components/indicator-badges";
import type {
  SecurityReportIncidentSummaryContentDto,
  SecurityReportPostureSummaryContentDto,
  SecurityReportThreatIntelSummaryContentDto,
} from "@pentesthub/shared";

export default function SecurityReportDetailPage() {
  const params = useParams<{ reportId: string }>();
  const { data: report, isLoading } = useSecurityReport(params.reportId);

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link href="/security-reports">
          <ArrowLeft className="size-4" /> Back to reports
        </Link>
      </Button>

      {isLoading || !report ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <FileBarChart className="size-6" /> {report.title}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <SecurityReportTypeBadge type={report.type} /> Generated {formatDateTime(report.createdAt)}
              {report.periodStart && report.periodEnd && (
                <span> · {formatDateTime(report.periodStart)} – {formatDateTime(report.periodEnd)}</span>
              )}
            </p>
          </div>

          {report.type === "INCIDENT_SUMMARY" && (
            <IncidentSummaryContent content={report.content as SecurityReportIncidentSummaryContentDto} />
          )}
          {report.type === "THREAT_INTEL_SUMMARY" && (
            <ThreatIntelSummaryContent content={report.content as SecurityReportThreatIntelSummaryContentDto} />
          )}
          {report.type === "POSTURE_SUMMARY" && (
            <PostureSummaryContent content={report.content as SecurityReportPostureSummaryContentDto} />
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function IncidentSummaryContent({ content }: { content: SecurityReportIncidentSummaryContentDto }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total incidents" value={content.totalIncidents} />
        <StatCard label="Open incidents" value={content.openIncidents} />
        <StatCard label="SLA breaches" value={content.slaBreaches} />
        <StatCard label="Critical" value={content.bySeverity.CRITICAL} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Incidents in this snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          {content.incidents.length === 0 ? (
            <EmptyState icon={FileBarChart} title="No incidents in this snapshot" />
          ) : (
            <div className="flex flex-col gap-2">
              {content.incidents.map((incident) => (
                <div key={incident.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                  <span className="truncate text-sm font-medium">{incident.title}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <IncidentSeverityBadge severity={incident.severity} />
                    <IncidentStatusBadge status={incident.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ThreatIntelSummaryContent({ content }: { content: SecurityReportThreatIntelSummaryContentDto }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total indicators" value={content.totalIndicators} />
        <StatCard label="Active indicators" value={content.activeIndicators} />
        <StatCard label="Types observed" value={Object.keys(content.byType).length} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Most recently seen indicators</CardTitle>
        </CardHeader>
        <CardContent>
          {content.recentIndicators.length === 0 ? (
            <EmptyState icon={FileBarChart} title="No indicators in this snapshot" />
          ) : (
            <div className="flex flex-col gap-2">
              {content.recentIndicators.map((indicator) => (
                <div key={indicator.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                  <span className="truncate font-mono text-xs">{indicator.value}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <IndicatorTypeBadge type={indicator.type} />
                    <span className="text-xs text-muted-foreground">{Math.round(indicator.confidence * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PostureSummaryContent({ content }: { content: SecurityReportPostureSummaryContentDto }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="MTTD" value={content.metrics.mttdHours != null ? `${content.metrics.mttdHours.toFixed(1)}h` : "—"} />
        <StatCard
          label="MTTR (incident)"
          value={content.metrics.mttrIncidentHours != null ? `${content.metrics.mttrIncidentHours.toFixed(1)}h` : "—"}
        />
        <StatCard label="Open remediation" value={content.openRemediationTasks} />
        <StatCard label="Overdue remediation" value={content.overdueRemediationTasks} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incidents by severity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((severity) => (
              <div key={severity} className="flex items-center justify-between">
                <IncidentSeverityBadge severity={severity} />
                <span className="text-sm font-medium">{content.incidentsBySeverity[severity]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Remediation backlog by priority</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
              <div key={priority} className="flex items-center justify-between text-sm">
                <span>{priority}</span>
                <span className="font-medium">{content.remediationByPriority[priority]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
