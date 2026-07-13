"use client";

import { FileCode2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvidenceItem } from "@/features/evidence/hooks/use-evidence";
import type { VulnFindingEvidenceRefsDto } from "@pentesthub/shared";

const EVIDENCE_SECTIONS: { key: keyof VulnFindingEvidenceRefsDto; label: string }[] = [
  { key: "requestEvidenceId", label: "HTTP request" },
  { key: "responseEvidenceId", label: "HTTP response" },
  { key: "commandEvidenceId", label: "Command" },
  { key: "payloadEvidenceId", label: "Payload" },
  { key: "rawOutputEvidenceId", label: "Raw scanner output" },
  { key: "screenshotEvidenceId", label: "Screenshot" },
];

/// Every v1 scanner (Nuclei/ffuf/dirsearch/feroxbuster/Nikto) produces
/// plain-text evidence only, so this renders each attached Evidence's
/// textContent in a <pre> block — no image/attachment rendering path
/// exists yet (screenshotEvidenceId is reserved for a future
/// visual-capture scanner like OWASP ZAP; it will simply never resolve
/// to anything for v1, so that section quietly doesn't render).
export function VulnFindingEvidencePanel({ evidence }: { evidence: VulnFindingEvidenceRefsDto }) {
  const attached = EVIDENCE_SECTIONS.filter((section) => evidence[section.key]);

  if (attached.length === 0) {
    return <p className="text-sm text-muted-foreground">No evidence attached to this finding.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {attached.map((section) => (
        <EvidenceBlock key={section.key} evidenceId={evidence[section.key] as string} label={section.label} />
      ))}
    </div>
  );
}

function EvidenceBlock({ evidenceId, label }: { evidenceId: string; label: string }) {
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
          {data?.textContent ?? "(no content)"}
        </pre>
      )}
    </div>
  );
}
