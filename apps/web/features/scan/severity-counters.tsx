"use client";

import type { VulnFindingDto, VulnFindingSeverity } from "@pentesthub/shared";
import { SEVERITY_CLASS } from "@/features/vuln/components/vuln-finding-severity-badge";
import { useI18n } from "@/features/i18n/i18n-context";
import { cn } from "@/lib/utils";

const ORDER: VulnFindingSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

/// Live severity counters. The page keeps `findings` fresh while a scan runs;
/// the region is a polite live region, so assistive tech hears the change
/// without being interrupted. Three columns on a phone (the longest Russian
/// label needs the room), five from the `sm` breakpoint up.
export function SeverityCounters({ findings }: { findings: VulnFindingDto[] | undefined }) {
  const { t } = useI18n();
  const counts: Record<VulnFindingSeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const finding of findings ?? []) counts[finding.severity] += 1;

  return (
    <div
      role="group"
      aria-live="polite"
      aria-label={t("vuln.dashboard.findingsBySeverity")}
      className="grid grid-cols-3 gap-2 sm:grid-cols-5"
    >
      {ORDER.map((severity) => (
        <div
          key={severity}
          className={cn("flex min-w-0 flex-col items-center rounded-lg border px-2 py-2.5", SEVERITY_CLASS[severity])}
        >
          <span className="text-xl leading-none font-semibold tabular-nums">{counts[severity]}</span>
          <span className="mt-1 w-full truncate text-center text-xs">{t(`severity.${severity}` as const)}</span>
        </div>
      ))}
    </div>
  );
}
