"use client";

import * as React from "react";
import { Circle, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/features/i18n/i18n-context";
import { useVulnScanJobLogs } from "../hooks/use-vuln";

const LEVEL_COLOR: Record<string, string> = {
  DEBUG: "text-muted-foreground",
  INFO: "text-foreground",
  WARN: "text-warning",
  ERROR: "text-destructive",
};

/// Direct analog of ReconLiveLogPanel — only streams while the job is
/// actually running/retrying; a finished job's VulnScanJobLog rows are
/// already complete and read via the normal REST list, not this SSE
/// stream.
export function VulnLiveLogPanel({ jobId, enabled }: { jobId: string; enabled: boolean }) {
  const { t } = useI18n();
  const { logs, connected, error } = useVulnScanJobLogs(jobId, enabled);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [logs]);

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Terminal className="size-3.5" /> {t("vuln.log.title")}
        </div>
        {enabled && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Circle
              className={cn("size-2", connected ? "fill-success text-success" : "fill-muted text-muted")}
            />
            {connected ? t("recon.log.streaming") : t("recon.log.connecting")}
          </div>
        )}
      </div>
      <div ref={scrollRef} className="max-h-80 overflow-y-auto px-3 py-2 font-mono text-xs">
        {error && <p className="text-destructive">{error}</p>}
        {logs.length === 0 && !error && (
          <p className="text-muted-foreground">
            {enabled ? t("recon.log.waiting") : t("recon.log.finished")}
          </p>
        )}
        {logs.map((log) => (
          <div key={log.id} className={cn("whitespace-pre-wrap", LEVEL_COLOR[log.level])}>
            <span className="text-muted-foreground">[{log.level}]</span> {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}
