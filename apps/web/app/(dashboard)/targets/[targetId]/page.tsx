"use client";

import { use } from "react";
import Link from "next/link";
import { FileText, ImageIcon, Layers, Radar, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { useTarget } from "@/features/targets/hooks/use-targets";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { useEvidenceList } from "@/features/evidence/hooks/use-evidence";
import { useReconJobsForTarget } from "@/features/recon/hooks/use-recon";
import { useVulnScanJobsForTarget } from "@/features/vuln/hooks/use-vuln";
import { useChangeEvents, useTechnologies } from "@/features/intelligence/hooks/use-intelligence";
import { formatDateTime } from "@/lib/format";
import { TargetTypeBadge } from "@/features/targets/components/target-type-badge";
import { TargetActionsMenu } from "@/features/targets/components/target-actions-menu";
import { TargetAuthorizationCard } from "@/features/targets/components/target-authorization-card";
import { CreateReconJobDialog } from "@/features/recon/components/create-recon-job-dialog";
import { ReconJobList } from "@/features/recon/components/recon-job-list";
import { CreateVulnScanJobDialog } from "@/features/vuln/components/create-vuln-scan-job-dialog";
import { VulnScanJobList } from "@/features/vuln/components/vuln-scan-job-list";
import { formatDate } from "@/lib/format";

const SCOPE_VARIANT: Record<string, "success" | "destructive" | "outline"> = {
  IN_SCOPE: "success",
  OUT_OF_SCOPE: "destructive",
  PENDING_REVIEW: "outline",
};

export default function TargetDetailPage({ params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = use(params);
  const { data: target, isLoading, isError, refetch } = useTarget(targetId);
  const { data: notes, isLoading: notesLoading } = useNotes(target?.projectId ?? "", targetId);
  const { data: evidence, isLoading: evidenceLoading } = useEvidenceList(
    target?.projectId ?? "",
    targetId,
  );
  const { data: reconJobs, isLoading: reconLoading } = useReconJobsForTarget(targetId);
  const { data: vulnJobs, isLoading: vulnLoading } = useVulnScanJobsForTarget(targetId);
  const { data: technologies, isLoading: technologiesLoading } = useTechnologies(targetId);
  const { data: changeEvents, isLoading: changeEventsLoading } = useChangeEvents(targetId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !target) {
    return <ErrorState description="Couldn't load this target." onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TargetTypeBadge type={target.type} />
            <h1 className="font-mono text-xl font-semibold">{target.value}</h1>
          </div>
          {target.name && <p className="mt-1 text-sm text-muted-foreground">{target.name}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={SCOPE_VARIANT[target.scopeStatus]}>
              {target.scopeStatus.replace("_", " ")}
            </Badge>
            <Badge variant="outline">{target.environment}</Badge>
            {target.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">
                {tag.name}
              </Badge>
            ))}
          </div>
          {target.description && (
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">{target.description}</p>
          )}
          <Link
            href={`/projects/${target.projectId}?tab=targets`}
            className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to project
          </Link>
        </div>
        <TargetActionsMenu target={target} />
      </div>

      <TargetAuthorizationCard targetId={targetId} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="size-4" /> Recon
          </CardTitle>
          <CreateReconJobDialog targetId={targetId} targetType={target.type} />
        </CardHeader>
        <CardContent>
          <ReconJobList
            jobs={reconJobs}
            isLoading={reconLoading}
            emptyDescription="Start a scan to enumerate subdomains, ports, and technologies."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4" /> Vulnerabilities
          </CardTitle>
          <CreateVulnScanJobDialog targetId={targetId} targetType={target.type} />
        </CardHeader>
        <CardContent>
          <VulnScanJobList
            jobs={vulnJobs}
            isLoading={vulnLoading}
            emptyDescription="Start a scan to find vulnerabilities on this target."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4" /> Technologies &amp; changes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {technologiesLoading ? (
            <ListSkeleton rows={2} />
          ) : !technologies || technologies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No technologies detected yet — run a Recon scan (HTTPX/WhatWeb) to fingerprint this target.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {technologies.map((tech) => (
                <Badge key={tech.id} variant="outline">
                  {tech.name}
                  {tech.version ? ` ${tech.version}` : ""}
                </Badge>
              ))}
            </div>
          )}

          {!changeEventsLoading && changeEvents && changeEvents.length > 0 && (
            <div className="flex flex-col divide-y divide-border border-t border-border pt-2">
              {changeEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm">{event.changeType.replace(/_/g, " ")} — {event.entityRef}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(event.detectedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" /> Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notesLoading ? (
            <ListSkeleton rows={2} />
          ) : !notes || notes.length === 0 ? (
            <EmptyState icon={FileText} title="No notes for this target" />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {notes.map((note) => (
                <Link
                  key={note.id}
                  href={`/notes/${note.id}`}
                  className="flex items-center justify-between py-2 hover:text-primary"
                >
                  <span className="truncate text-sm">{note.title ?? "Untitled note"}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(note.updatedAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="size-4" /> Evidence
          </CardTitle>
        </CardHeader>
        <CardContent>
          {evidenceLoading ? (
            <ListSkeleton rows={2} />
          ) : !evidence || evidence.length === 0 ? (
            <EmptyState icon={ImageIcon} title="No evidence for this target" />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {evidence.map((item) => (
                <Link
                  key={item.id}
                  href={`/evidence/${item.id}`}
                  className="flex items-center justify-between py-2 hover:text-primary"
                >
                  <span className="truncate text-sm">{item.title}</span>
                  <Badge variant="outline">{item.type.replace("_", " ")}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
