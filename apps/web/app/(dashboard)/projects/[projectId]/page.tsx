"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, ImageIcon, Layers, Plus, Radar, ShieldAlert, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { ErrorState } from "@/components/common/error-state";
import { useProject } from "@/features/projects/hooks/use-projects";
import { useTargets } from "@/features/targets/hooks/use-targets";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { useEvidenceList } from "@/features/evidence/hooks/use-evidence";
import { useActivity } from "@/features/activity/hooks/use-activity";
import { useReconJobsForProject } from "@/features/recon/hooks/use-recon";
import { useVulnScanJobsForProject } from "@/features/vuln/hooks/use-vuln";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { ProjectActionsMenu } from "@/features/projects/components/project-actions-menu";
import { TargetTypeBadge } from "@/features/targets/components/target-type-badge";
import { ActivityFeed } from "@/features/activity/components/activity-feed";
import { ReconJobList } from "@/features/recon/components/recon-job-list";
import { VulnScanJobList } from "@/features/vuln/components/vuln-scan-job-list";
import { useAttackSurface } from "@/features/intelligence/hooks/use-intelligence";
import { formatDate } from "@/lib/format";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense>
      <ProjectDetailContent params={params} />
    </Suspense>
  );
}

function ProjectDetailContent({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { data: project, isLoading, isError, refetch } = useProject(projectId);
  const tabParam = useSearchParams().get("tab");
  const initialTab = [
    "targets",
    "notes",
    "evidence",
    "recon",
    "vuln",
    "attack-surface",
    "activity",
  ].includes(tabParam ?? "")
    ? tabParam!
    : "targets";

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !project) {
    return <ErrorState description="Couldn't load this project." onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          {project.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{project.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <Badge key={tag.id} variant="outline">
                {tag.name}
              </Badge>
            ))}
          </div>
        </div>
        <ProjectActionsMenu project={project} />
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="recon">Scan History</TabsTrigger>
          <TabsTrigger value="vuln">Vulnerabilities</TabsTrigger>
          <TabsTrigger value="attack-surface">Attack Surface</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="targets" className="pt-4">
          <TargetsTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="notes" className="pt-4">
          <NotesTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="evidence" className="pt-4">
          <EvidenceTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="recon" className="pt-4">
          <ReconTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="vuln" className="pt-4">
          <VulnTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="attack-surface" className="pt-4">
          <AttackSurfaceTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="activity" className="pt-4">
          <ActivityTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/// Module 16 — task #375. Read-only aggregate over Asset Graph node
/// counts + 7-day Change Detection deltas (see AssetGraphService's doc
/// comment) — nothing here is computed client-side.
function AttackSurfaceTab({ projectId }: { projectId: string }) {
  const { data: summary, isLoading } = useAttackSurface(projectId);

  if (isLoading) return <ListSkeleton rows={2} />;
  if (!summary || summary.totalAssets === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No attack surface data yet"
        description="Run a Recon scan on this project's targets to populate the attack surface."
      />
    );
  }

  const stats: Array<{ label: string; value: number }> = [
    { label: "Total assets", value: summary.totalAssets },
    { label: "Live hosts", value: summary.liveHosts },
    { label: "Open ports", value: summary.openPorts },
    { label: "HTTP services", value: summary.httpServices },
    { label: "Technologies", value: summary.technologies },
    { label: "High-risk assets", value: summary.highRiskAssets },
    { label: "New (7d)", value: summary.newAssets7d },
    { label: "Removed (7d)", value: summary.removedAssets7d },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TargetsTab({ projectId }: { projectId: string }) {
  const { data: targets, isLoading } = useTargets(projectId);
  if (isLoading) return <ListSkeleton />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" asChild>
          <Link href={`/targets/new?projectId=${projectId}`}>
            <Plus className="size-4" /> Add target
          </Link>
        </Button>
      </div>
      {!targets || targets.length === 0 ? (
        <EmptyState icon={Target} title="No targets yet" description="Add domains, IPs, URLs, and more." />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {targets.map((target) => (
            <Link
              key={target.id}
              href={`/targets/${target.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40"
            >
              <div className="flex items-center gap-3">
                <TargetTypeBadge type={target.type} />
                <span className="font-mono text-sm">{target.value}</span>
              </div>
              <Badge variant="outline">{target.scopeStatus.replace("_", " ")}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesTab({ projectId }: { projectId: string }) {
  const { data: notes, isLoading } = useNotes(projectId);
  if (isLoading) return <ListSkeleton />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" asChild>
          <Link href={`/notes/new?projectId=${projectId}`}>
            <Plus className="size-4" /> New note
          </Link>
        </Button>
      </div>
      {!notes || notes.length === 0 ? (
        <EmptyState icon={FileText} title="No notes yet" description="Capture findings in markdown." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {notes.map((note) => (
            <Link key={note.id} href={`/notes/${note.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="pt-6">
                  <p className="truncate font-medium">{note.title ?? "Untitled note"}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{note.content}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatDate(note.updatedAt)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceTab({ projectId }: { projectId: string }) {
  const { data: evidence, isLoading } = useEvidenceList(projectId);
  if (isLoading) return <ListSkeleton />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" asChild>
          <Link href={`/evidence/new?projectId=${projectId}`}>
            <Plus className="size-4" /> Add evidence
          </Link>
        </Button>
      </div>
      {!evidence || evidence.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No evidence yet" description="Screenshots, requests, logs, and files." />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {evidence.map((item) => (
            <Link
              key={item.id}
              href={`/evidence/${item.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40"
            >
              <span className="font-medium">{item.title}</span>
              <Badge variant="outline">{item.type.replace("_", " ")}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ReconTab({ projectId }: { projectId: string }) {
  const { data: jobs, isLoading } = useReconJobsForProject(projectId);
  return (
    <div className="flex flex-col gap-3">
      {!jobs || jobs.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="No scan history yet"
          description="Start a scan from any target in this project to see it here."
        />
      ) : (
        <ReconJobList jobs={jobs} isLoading={isLoading} showTarget />
      )}
    </div>
  );
}

function VulnTab({ projectId }: { projectId: string }) {
  const { data: jobs, isLoading } = useVulnScanJobsForProject(projectId);
  return (
    <div className="flex flex-col gap-3">
      {!jobs || jobs.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No vulnerability scans yet"
          description="Start a scan from any target in this project to see it here."
        />
      ) : (
        <VulnScanJobList jobs={jobs} isLoading={isLoading} showTarget />
      )}
    </div>
  );
}

function ActivityTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useActivity({ projectId });
  return <ActivityFeed events={data} isLoading={isLoading} />;
}
