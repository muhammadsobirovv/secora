"use client";

import Link from "next/link";
import { ChevronDown, SearchX } from "lucide-react";
import type { VulnFindingDto } from "@pentesthub/shared";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { VulnFindingSeverityBadge } from "@/features/vuln/components/vuln-finding-severity-badge";
import { VulnFindingStatusBadge } from "@/features/vuln/components/vuln-finding-status-badge";
import { useI18n } from "@/features/i18n/i18n-context";

/// The scanner template's remediation advice, when it ships one (nuclei's
/// info.remediation, stored in the finding's data). Without it the card shows
/// the description and references as before.
function remediationOf(finding: VulnFindingDto): string | null {
  const value = finding.data?.remediation;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/// Findings as cards for phone screens (the table stays for desktop). Each card
/// shows severity, title and location; "Details & fix" expands the scanner's
/// description and reference links. It is a native <details>, so it works
/// without JavaScript and is keyboard- and screen-reader-friendly; the summary
/// is 44 px tall for touch.
export function VulnFindingCards({
  findings,
  isLoading,
}: {
  findings: VulnFindingDto[] | undefined;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  if (isLoading) return <ListSkeleton />;

  if (!findings || findings.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("vuln.findings.emptyTitle")}
        description={t("vuln.findings.emptyDescription")}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {findings.map((finding) => (
        <li key={finding.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <VulnFindingSeverityBadge severity={finding.severity} />
            <VulnFindingStatusBadge status={finding.status} />
          </div>
          <Link
            href={`/vuln/findings/${finding.id}`}
            aria-label={`${t("scan.finding.open")}: ${finding.title}`}
            className="mt-2 line-clamp-2 block text-sm font-medium break-words hover:underline"
          >
            {finding.title}
          </Link>
          {finding.path && (
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{finding.path}</p>
          )}

          <details className="group mt-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm text-primary [&::-webkit-details-marker]:hidden">
              {t("scan.finding.details")}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="flex flex-col gap-2 pb-1 text-sm text-muted-foreground">
              {remediationOf(finding) && (
                <div>
                  <p className="text-xs font-medium text-foreground">{t("scan.finding.remediation")}</p>
                  <p className="mt-0.5 break-words whitespace-pre-wrap">{remediationOf(finding)}</p>
                </div>
              )}
              <div>
                {remediationOf(finding) && (
                  <p className="text-xs font-medium text-foreground">{t("scan.finding.description")}</p>
                )}
                <p className="break-words whitespace-pre-wrap">
                  {finding.description || t("scan.finding.noDetails")}
                </p>
              </div>
              {finding.references.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground">{t("scan.finding.references")}</p>
                  <ul className="mt-1 flex flex-col gap-1 text-xs">
                    {finding.references.map((reference) => (
                      <li key={reference} className="break-all">
                        <a href={reference} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {reference}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
