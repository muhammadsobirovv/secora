"use client";

import { CheckCircle2, CircleDashed, Loader2, PauseCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/features/i18n/i18n-context";
import type { VulnScanJobToolRunDto } from "@pentesthub/shared";

const STATUS_ICON: Record<VulnScanJobToolRunDto["status"], React.ReactNode> = {
  PENDING: <CircleDashed className="size-4 text-muted-foreground" />,
  RUNNING: <Loader2 className="size-4 animate-spin text-primary" />,
  PAUSED: <PauseCircle className="size-4 text-muted-foreground" />,
  RETRYING: <Loader2 className="size-4 animate-spin text-warning" />,
  COMPLETED: <CheckCircle2 className="size-4 text-success" />,
  FAILED: <XCircle className="size-4 text-destructive" />,
  CANCELLED: <XCircle className="size-4 text-muted-foreground" />,
};

/// The per-scanner breakdown within one job — direct analog of Recon's
/// ReconJobProgress, one row per VulnScanJobToolRun (written to as
/// VulnScanJobExecutionService works through the job's scanner list).
export function VulnScanJobProgress({ toolRuns }: { toolRuns: VulnScanJobToolRunDto[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {toolRuns.map((run) => (
        <div key={run.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {STATUS_ICON[run.status]}
            <span className="font-mono text-sm">{run.scanner}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {run.status === "COMPLETED" && <span>{t("recon.progress.findings", { count: run.findingsCount })}</span>}
            {run.errorMessage && (
              <Badge variant="destructive" className="max-w-64 truncate" title={run.errorMessage}>
                {run.errorMessage}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
