import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VulnFindingSeverity } from "@pentesthub/shared";

/// The shared Badge component only ships 6 semantic variants (default,
/// secondary, destructive, success, warning, outline) — not enough for 5
/// visually-distinct severity levels (Info/Low/Medium/High/Critical), so
/// this layers extra color classes on top of variant="outline" rather
/// than adding severity-specific variants to the shared component (which
/// no other module needs).
const SEVERITY_CLASS: Record<VulnFindingSeverity, string> = {
  INFO: "border-border text-muted-foreground",
  LOW: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  MEDIUM: "border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  CRITICAL: "border-destructive/30 bg-destructive/10 text-destructive",
};

const SEVERITY_LABEL: Record<VulnFindingSeverity, string> = {
  INFO: "Info",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export function VulnFindingSeverityBadge({
  severity,
  className,
}: {
  severity: VulnFindingSeverity;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(SEVERITY_CLASS[severity], className)}>
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
}
