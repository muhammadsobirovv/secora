"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { useI18n } from "@/features/i18n/i18n-context";
import { ReportExportButtons, ShareReportDialog } from "@/features/vuln-report/report-actions";
import { ReportView } from "@/features/vuln-report/report-view";
import { explainFinding, getVulnReport } from "@/lib/api/vuln-report";

const RUNNING = new Set(["PENDING", "RUNNING", "RETRYING", "PAUSED"]);

/// The report of one scan: grade and score, what was not tested, one card per
/// finding (explained in plain language on request), exports and sharing.
export default function VulnReportPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { t, locale } = useI18n();
  const { jobId } = use(params);
  const { data: report, isLoading, isError, refetch } = useQuery({
    queryKey: ["vuln-report", jobId, locale],
    queryFn: () => getVulnReport(jobId, locale),
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Link href={`/vuln/jobs/${jobId}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> {t("report.backToScan")}
        </Link>
        <h1 className="text-xl font-semibold">{t("report.title")}</h1>
        <div className="flex flex-wrap gap-2">
          <ShareReportDialog jobId={jobId} />
        </div>
        <ReportExportButtons jobId={jobId} language={locale} />
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {isError && <ErrorState title={t("report.loadError")} onRetry={() => void refetch()} />}
      {report && (
        <>
          {RUNNING.has(report.status) && (
            <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              {t("report.running")}
            </p>
          )}
          {(report.status === "FAILED" || report.status === "CANCELLED") && (
            <p role="status" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              {t("report.failedScan")}
            </p>
          )}
          <ReportView report={report} explain={(findingId) => explainFinding(jobId, findingId, locale)} />
        </>
      )}
    </div>
  );
}
