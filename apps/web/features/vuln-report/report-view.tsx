"use client";

import type { FindingExplanationDto, ReportGrade, ReportNotTestedDto, VulnFindingSeverity, VulnReportDto } from "@pentesthub/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SEVERITY_CLASS } from "@/features/vuln/components/vuln-finding-severity-badge";
import { useI18n } from "@/features/i18n/i18n-context";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReportFindingCard } from "./report-finding-card";

const SEVERITIES: VulnFindingSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

const GRADE_CLASS: Record<ReportGrade, string> = {
  A: "text-success",
  B: "text-success",
  C: "text-warning-foreground dark:text-warning",
  D: "text-sev-high",
  F: "text-sev-critical",
};

function useNotTestedText() {
  const { t } = useI18n();
  return (item: ReportNotTestedDto): string => {
    const detail = item.detail ? ` (${item.detail.replace(/[\r\n]+/g, " ").slice(0, 200)})` : "";
    const stage = item.stage ? t(`scan.stage.${item.stage}` as const) : "";
    return t(`report.nt.${item.code}` as const, { stage, detail });
  };
}

/// The report, as cards. Used by the signed-in report page and by the shared
/// page; the only difference is `explain`, which only the signed-in page passes.
export function ReportView({
  report,
  explain,
}: {
  report: VulnReportDto;
  explain?: (findingId: string) => Promise<FindingExplanationDto>;
}) {
  const { t } = useI18n();
  const notTested = useNotTestedText();
  const clientEngagement = report.authorization?.kind === "ROE";
  const scope =
    report.scope.root === null
      ? t("report.scope.unknown")
      : t(
          report.scope.includesSubdomains
            ? clientEngagement
              ? "report.scope.apexClient"
              : "report.scope.apex"
            : clientEngagement
              ? "report.scope.hostClient"
              : "report.scope.host",
          { root: report.scope.root },
        );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-center gap-4">
            <div className="flex min-w-16 flex-col items-center">
              <span className={cn("text-5xl leading-none font-bold", GRADE_CLASS[report.grade])} aria-label={t("report.grade")}>
                {report.grade}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">{t("report.grade")}</span>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold">
                {t("report.score")}: {report.score}/100
              </p>
              <p className="text-sm break-all text-muted-foreground">{report.target.value}</p>
            </div>
          </div>

          <div role="group" aria-label={t("vuln.dashboard.findingsBySeverity")} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {SEVERITIES.map((severity) => (
              <div key={severity} className={cn("flex min-w-0 flex-col items-center rounded-lg border px-2 py-2", SEVERITY_CLASS[severity])}>
                <span className="text-xl font-semibold tabular-nums">{report.counts[severity]}</span>
                <span className="w-full truncate text-center text-xs">{t(`severity.${severity}` as const)}</span>
              </div>
            ))}
          </div>

          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("report.scopeTitle")}</dt>
            <dd className="break-words">{scope}</dd>
            <dt className="text-muted-foreground">{t("report.auth.title")}</dt>
            <dd className="break-words">
              {clientEngagement
                ? t("report.auth.client", { client: report.authorization.clientName ?? "" })
                : t("report.auth.ownership")}
            </dd>
            {clientEngagement && (
              <>
                <dt className="text-muted-foreground">{t("report.auth.window")}</dt>
                <dd>
                  {report.authorization.windowStart ? formatDateTime(report.authorization.windowStart) : "-"} –{" "}
                  {report.authorization.windowEnd ? formatDateTime(report.authorization.windowEnd) : "-"}
                </dd>
                {report.authorization.approvedAt && (
                  <>
                    <dt className="text-muted-foreground">{t("report.auth.approved")}</dt>
                    <dd>{formatDateTime(report.authorization.approvedAt)}</dd>
                  </>
                )}
                {report.authorization.approvedBy && (
                  <>
                    <dt className="text-muted-foreground">{t("report.auth.approvedBy")}</dt>
                    <dd className="break-all">{report.authorization.approvedBy}</dd>
                  </>
                )}
              </>
            )}
            <dt className="text-muted-foreground">{t("report.profileLabel")}</dt>
            <dd>{t(`report.profile.${report.profile ?? "NONE"}` as const)}</dd>
            <dt className="text-muted-foreground">{t("report.started")}</dt>
            <dd>{formatDateTime(report.startedAt ?? report.generatedAt)}</dd>
            <dt className="text-muted-foreground">{t("report.finished")}</dt>
            <dd>{report.completedAt ? formatDateTime(report.completedAt) : "-"}</dd>
          </dl>
          {clientEngagement && <p className="text-xs text-muted-foreground">{t("report.auth.note")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("report.notTested.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t("report.notTested.intro")}</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
            {report.notTested.map((item, index) => (
              <li key={`${item.code}-${item.stage ?? index}`} className="break-words">
                {notTested(item)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <section aria-label={t("report.findings")} className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">
          {t("report.findings")} ({report.findings.length})
        </h2>
        {report.findings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t("report.noFindings")}</p>
        ) : (
          report.findings.map((finding) => <ReportFindingCard key={finding.id} finding={finding} explain={explain} />)
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("report.stages")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5 text-sm">
            {report.stages.map((stage) => (
              <li key={stage.stage} className="flex flex-wrap justify-between gap-2">
                <span>{t(`scan.stage.${stage.stage}` as const)}</span>
                <span className="text-muted-foreground">{t(`report.stageState.${stage.state}` as const)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("report.tools")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5 text-sm">
            {report.tools.map((tool) => (
              <li key={tool.tool} className="flex flex-wrap justify-between gap-2">
                <span className="break-all">
                  {tool.tool} <span className="text-muted-foreground">{tool.version}</span>
                </span>
                <span className="text-muted-foreground">{t(tool.ran ? "report.tool.ran" : "report.tool.notRun")}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("report.methodology")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
            <li>{t("report.method1")}</li>
            <li>{t("report.method2")}</li>
            <li>{t("report.method3")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
