"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { useVulnFinding } from "@/features/vuln/hooks/use-vuln";
import { VulnFindingSeverityBadge } from "@/features/vuln/components/vuln-finding-severity-badge";
import { VulnFindingStatusSelect } from "@/features/vuln/components/vuln-finding-status-select";
import { VulnFindingEvidencePanel } from "@/features/vuln/components/vuln-finding-evidence-panel";
import { formatDateTime } from "@/lib/format";

export default function VulnFindingDetailPage({ params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = use(params);
  const { data: finding, isLoading, isError, refetch } = useVulnFinding(findingId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !finding) {
    return <ErrorState description="Couldn't load this finding." onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/vuln/findings"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to findings
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <VulnFindingSeverityBadge severity={finding.severity} />
              <h1 className="text-xl font-semibold">{finding.title}</h1>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <Link href={`/targets/${finding.targetId}`} className="hover:text-foreground hover:underline">
                Target →
              </Link>
              <Link href={`/vuln/jobs/${finding.jobId}`} className="hover:text-foreground hover:underline">
                Scan job →
              </Link>
              <Badge variant="outline">{finding.scanner}</Badge>
              {finding.scannerVersion && <span>v{finding.scannerVersion}</span>}
            </div>
          </div>
          <VulnFindingStatusSelect findingId={finding.id} status={finding.status} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap text-foreground">{finding.description}</p>
          {finding.path && (
            <p className="mt-3 font-mono text-xs text-muted-foreground">Path: {finding.path}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classification</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Field label="CVSS score" value={finding.cvssScore !== null ? finding.cvssScore.toFixed(1) : "—"} />
          <Field label="CVSS vector" value={finding.cvssVector ?? "—"} mono />
          <Field label="CWE" value={finding.cwe ?? "—"} />
          <Field label="OWASP category" value={finding.owaspCategory?.replace(/_/g, " ") ?? "—"} />
          <Field label="Confidence" value={finding.confidence} />
          <Field label="Vulnerability type" value={finding.vulnType} />
        </CardContent>
      </Card>

      {(finding.tags.length > 0 || finding.references.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tags & references</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {finding.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {finding.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {finding.references.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs">
                {finding.references.map((ref) => (
                  <li key={ref} className="truncate">
                    <a href={ref} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {ref}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <VulnFindingEvidencePanel evidence={finding} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4" /> Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            <TimelineRow label="First seen" at={finding.firstSeenAt} />
            <TimelineRow label="Last seen" at={finding.lastSeenAt} />
            <TimelineRow label="Created" at={finding.createdAt} />
            <TimelineRow label="Last updated" at={finding.updatedAt} />
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? "truncate font-mono text-xs" : "text-sm"} title={mono ? value : undefined}>
        {value}
      </p>
    </div>
  );
}

function TimelineRow({ label, at }: { label: string; at: string }) {
  return (
    <li className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{formatDateTime(at)}</span>
    </li>
  );
}
