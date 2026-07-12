import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReconJobToolRunDto } from "@pentesthub/shared";

const STATUS_ICON: Record<ReconJobToolRunDto["status"], React.ReactNode> = {
  PENDING: <CircleDashed className="size-4 text-muted-foreground" />,
  RUNNING: <Loader2 className="size-4 animate-spin text-primary" />,
  RETRYING: <Loader2 className="size-4 animate-spin text-warning" />,
  COMPLETED: <CheckCircle2 className="size-4 text-success" />,
  FAILED: <XCircle className="size-4 text-destructive" />,
  CANCELLED: <XCircle className="size-4 text-muted-foreground" />,
};

/// The per-tool breakdown within one job — "Job Progress" in the recon
/// dashboard spec. Each row is a ReconJobToolRun, which the worker writes
/// to as it works through the job's tool list sequentially (see
/// ReconJobExecutionService).
export function ReconJobProgress({ toolRuns }: { toolRuns: ReconJobToolRunDto[] }) {
  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {toolRuns.map((run) => (
        <div key={run.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {STATUS_ICON[run.status]}
            <span className="font-mono text-sm">{run.tool}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {run.status === "COMPLETED" && <span>{run.findingsCount} findings</span>}
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
