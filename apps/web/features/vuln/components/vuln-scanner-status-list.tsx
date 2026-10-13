"use client";

import { CheckCircle2, RadioTower, XCircle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { formatDistanceToNow } from "@/lib/format";
import { useI18n } from "@/features/i18n/i18n-context";
import type { VulnScannerHistoryEntryDto } from "@pentesthub/shared";

/// "Scanner Status" / "Scanner History" dashboard widget — one row per
/// scanner that has ever run in this workspace, aggregated server-side by
/// PrismaVulnScanJobsRepository.getScannerHistory (grouping
/// VulnScanJobToolRun rows). A scanner with zero runs simply doesn't
/// appear — there is nothing to report on it yet.
export function VulnScannerStatusList({
  entries,
  isLoading,
}: {
  entries: VulnScannerHistoryEntryDto[] | undefined;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  if (isLoading) return <ListSkeleton rows={3} />;

  if (!entries || entries.length === 0) {
    return (
      <EmptyState
        icon={RadioTower}
        title={t("vuln.scannerStatus.emptyTitle")}
        description={t("vuln.scannerStatus.emptyDescription")}
      />
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {entries.map((entry) => (
        <div key={entry.scanner} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm">{entry.scanner}</span>
            <span className="text-xs text-muted-foreground">{t("vuln.scannerHistory.runs", { count: entry.totalRuns })}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="size-3.5 text-success" /> {entry.completedRuns}
            </span>
            {entry.failedRuns > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="size-3.5 text-destructive" /> {entry.failedRuns}
              </span>
            )}
            <span>{t("recon.progress.findings", { count: entry.totalFindings })}</span>
            {entry.lastRunAt && <span>{formatDistanceToNow(entry.lastRunAt)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
