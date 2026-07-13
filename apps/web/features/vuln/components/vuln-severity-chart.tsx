import { VULN_SEVERITY_ORDER } from "@pentesthub/shared";
import type { VulnFindingSeverity } from "@pentesthub/shared";
import { cn } from "@/lib/utils";

const SEVERITY_BAR_CLASS: Record<VulnFindingSeverity, string> = {
  INFO: "bg-muted-foreground/40",
  LOW: "bg-blue-500",
  MEDIUM: "bg-warning",
  HIGH: "bg-orange-500",
  CRITICAL: "bg-destructive",
};

const SEVERITY_LABEL: Record<VulnFindingSeverity, string> = {
  INFO: "Info",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

/// A dependency-free horizontal bar chart (no charting library is wired
/// into apps/web yet) — five rows, weakest to strongest via
/// VULN_SEVERITY_ORDER, each bar width relative to the highest count so
/// the visual comparison holds even as totals grow across scans.
export function VulnSeverityChart({ counts }: { counts: Record<VulnFindingSeverity, number> }) {
  const max = Math.max(1, ...VULN_SEVERITY_ORDER.map((s) => counts[s] ?? 0));

  return (
    <div className="flex flex-col gap-2">
      {[...VULN_SEVERITY_ORDER].reverse().map((severity) => {
        const count = counts[severity] ?? 0;
        const widthPct = (count / max) * 100;
        return (
          <div key={severity} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{SEVERITY_LABEL[severity]}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", SEVERITY_BAR_CLASS[severity])}
                style={{ width: count > 0 ? `${Math.max(widthPct, 4)}%` : "0%" }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-medium">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
