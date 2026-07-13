"use client";

import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, PauseCircle, PlayCircle, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import {
  usePauseVulnScanJob,
  useResumeVulnScanJob,
  useRetryVulnScanJob,
  useStopVulnScanJob,
  useVulnScanJob,
  useVulnScanJobFindings,
} from "@/features/vuln/hooks/use-vuln";
import { VulnScanJobStatusBadge } from "@/features/vuln/components/vuln-scan-job-status-badge";
import { VulnScanJobProgress } from "@/features/vuln/components/vuln-scan-job-progress";
import { VulnLiveLogPanel } from "@/features/vuln/components/vuln-live-log-panel";
import { VulnFindingsTable } from "@/features/vuln/components/vuln-findings-table";
import { formatDateTime } from "@/lib/format";
import type { VulnScanJobStatus } from "@pentesthub/shared";

const TERMINAL_STATUSES: VulnScanJobStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];
const STOPPABLE_STATUSES: VulnScanJobStatus[] = ["PENDING", "RUNNING", "RETRYING", "PAUSED"];
const PAUSABLE_STATUSES: VulnScanJobStatus[] = ["RUNNING", "RETRYING"];

export default function VulnScanJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const { data: job, isLoading, isError, refetch } = useVulnScanJob(jobId);
  const { data: findings, isLoading: findingsLoading } = useVulnScanJobFindings(jobId);
  const stopJob = useStopVulnScanJob();
  const pauseJob = usePauseVulnScanJob();
  const resumeJob = useResumeVulnScanJob();
  const retryJob = useRetryVulnScanJob();

  async function handleStop(): Promise<void> {
    try {
      await stopJob.mutateAsync(jobId);
      toast.success("Stop requested");
    } catch {
      toast.error("Couldn't stop this job.");
    }
  }

  async function handlePause(): Promise<void> {
    try {
      await pauseJob.mutateAsync(jobId);
      toast.success("Pause requested");
    } catch {
      toast.error("Couldn't pause this job.");
    }
  }

  async function handleResume(): Promise<void> {
    try {
      await resumeJob.mutateAsync(jobId);
      toast.success("Job resumed");
    } catch {
      toast.error("Couldn't resume this job.");
    }
  }

  async function handleRetry(): Promise<void> {
    try {
      await retryJob.mutateAsync(jobId);
      toast.success("Job queued for retry");
    } catch {
      toast.error("Couldn't retry this job.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !job) {
    return <ErrorState description="Couldn't load this scan job." onRetry={() => void refetch()} />;
  }

  const isRunning = !TERMINAL_STATUSES.includes(job.status);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldAlert className="size-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Vulnerability scan</h1>
            <VulnScanJobStatusBadge status={job.status} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{job.id}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <Link href={`/targets/${job.targetId}`} className="hover:text-foreground hover:underline">
              Target →
            </Link>
            <Link href={`/projects/${job.projectId}?tab=vuln`} className="hover:text-foreground hover:underline">
              Project →
            </Link>
            <span>Priority {job.priority}</span>
            {job.startedAt && <span>Started {formatDateTime(job.startedAt)}</span>}
            {job.completedAt && <span>Completed {formatDateTime(job.completedAt)}</span>}
          </div>
          {job.error && <p className="mt-2 text-sm text-destructive">{job.error}</p>}
        </div>
        <div className="flex items-center gap-2">
          {PAUSABLE_STATUSES.includes(job.status) && (
            <Button size="sm" variant="outline" disabled={pauseJob.isPending} onClick={() => void handlePause()}>
              {pauseJob.isPending ? <Loader2 className="size-4 animate-spin" /> : <PauseCircle className="size-4" />}
              Pause
            </Button>
          )}
          {job.status === "PAUSED" && (
            <Button size="sm" variant="outline" disabled={resumeJob.isPending} onClick={() => void handleResume()}>
              {resumeJob.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
              Resume
            </Button>
          )}
          {STOPPABLE_STATUSES.includes(job.status) && (
            <Button size="sm" variant="outline" disabled={stopJob.isPending} onClick={() => void handleStop()}>
              {stopJob.isPending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
              Stop
            </Button>
          )}
          {job.status === "FAILED" && (
            <Button size="sm" disabled={retryJob.isPending} onClick={() => void handleRetry()}>
              {retryJob.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Retry
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <VulnScanJobProgress toolRuns={job.toolRuns} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live log</CardTitle>
        </CardHeader>
        <CardContent>
          <VulnLiveLogPanel jobId={job.id} enabled={isRunning} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Findings ({job.findingsCount})</CardTitle>
        </CardHeader>
        <CardContent>
          <VulnFindingsTable findings={findings} isLoading={findingsLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
