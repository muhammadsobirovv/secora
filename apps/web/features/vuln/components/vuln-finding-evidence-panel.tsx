"use client";

import { FileCode2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvidenceItem } from "@/features/evidence/hooks/use-evidence";
import { useI18n } from "@/features/i18n/i18n-context";
import type { VulnFindingEvidenceRefsDto } from "@pentesthub/shared";

const EVIDENCE_SECTIONS = [
  { key: "requestEvidenceId", labelKey: "vuln.evidence.request" },
  { key: "responseEvidenceId", labelKey: "vuln.evidence.response" },
  { key: "commandEvidenceId", labelKey: "vuln.evidence.command" },
  { key: "payloadEvidenceId", labelKey: "vuln.evidence.payload" },
  { key: "rawOutputEvidenceId", labelKey: "vuln.evidence.rawOutput" },
  { key: "screenshotEvidenceId", labelKey: "vuln.evidence.screenshot" },
] as const;

/// Every v1 scanner (Nuclei/ffuf/dirsearch/feroxbuster/Nikto) produces
/// plain-text evidence only, so this renders each attached Evidence's
/// textContent in a <pre> block — no image/attachment rendering path
/// exists yet (screenshotEvidenceId is reserved for a future
/// visual-capture scanner like OWASP ZAP; it will simply never resolve
/// to anything for v1, so that section quietly doesn't render).
export function VulnFindingEvidencePanel({ evidence }: { evidence: VulnFindingEvidenceRefsDto }) {
  const { t } = useI18n();
  const attached = EVIDENCE_SECTIONS.filter((section) => evidence[section.key]);

  if (attached.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("vuln.evidence.none")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {attached.map((section) => (
        <EvidenceBlock key={section.key} evidenceId={evidence[section.key] as string} label={t(section.labelKey)} />
      ))}
    </div>
  );
}

function EvidenceBlock({ evidenceId, label }: { evidenceId: string; label: string }) {
  const { t } = useI18n();
  const { data, isLoading } = useEvidenceItem(evidenceId);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <FileCode2 className="size-3.5" /> {label}
      </div>
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs whitespace-pre-wrap">
          {data?.textContent ?? t("vuln.evidence.noContent")}
        </pre>
      )}
    </div>
  );
}
