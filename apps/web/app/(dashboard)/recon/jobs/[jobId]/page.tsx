"use client";

import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Radar, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import {
  useCancelReconJob,
  useReconJob,
  useReconJobFindings,
  useRetryReconJob,
} from "@/features/recon/hooks/use-recon";
import { ReconJobStatusBadge } from "@/features/recon/components/recon-job-status-badge";
import { ReconJobProgress } from "@/features/recon/components/recon-job-progress";
import { ReconLiveLogPanel } from "@/features/recon/components/recon-live-log-panel";
import { ReconFindingsTable } from "@/features/recon/components/recon-findings-table";
import { formatDateTime } from "@/lib/format";
import type { ReconJobStatus } from "@pentesthub/shared";

const TERMINAL_STATUSES: ReconJobStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];
const CANCELLABLE_STATUSES: ReconJobStatus[] = ["PENDING", "RUNNING", "RETRYING"];

export default function ReconJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const { data: job, isLoading, isError, refetch } = useReconJob(jobId);
  const { data: findings, isLoading: findingsLoading } = useReconJobFindings(jobId);
  const cancelJob = useCancelReconJob();
  const retryJob = useRetryReconJob();

  async function handleCancel(): Promise<void> {
    try {
      await cancelJob.mutateAsync(jobId);
      toast.success("Cancellation requested");
    } catch {
      toast.error("Couldn't cancel this job.");
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
    return <ErrorState description="Couldn't load this recon job." onRetry={() => void refetch()} />;
  }

  const isRunning = !TERMINAL_STATUSES.includes(job.status);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Radar className="size-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Recon job</h1>
            <ReconJobStatusBadge status={job.status} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{job.id}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <Link href={`/targets/${job.targetId}`} className="hover:text-foreground hover:underline">
              Target →
            </Link>
            <Link href={`/projects/${job.projectId}?tab=recon`} className="hover:text-foreground hover:underline">
              Project →
            </Link>
            {job.startedAt && <span>Started {formatDateTime(job.startedAt)}</span>}
            {job.completedAt && <span>Completed {formatDateTime(job.completedAt)}</span>}
          </div>
          {job.error && <p className="mt-2 text-sm text-destructive">{job.error}</p>}
        </div>
        <div className="flex items-center gap-2">
          {CANCELLABLE_STATUSES.includes(job.status) && (
            <Button
              size="sm"
              variant="outline"
              disabled={cancelJob.isPending}
              onClick={() => void handleCancel()}
            >
              {cancelJob.isPending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
              Cancel
            </Button>
          )}
          {job.status === "FAILED" && (
            <Button size="sm" disabled={retryJob.isPending} onClick={() => void handleRetry()}>
              {retryJob.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
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
          <ReconJobProgress toolRuns={job.toolRuns} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live log</CardTitle>
        </CardHeader>
        <CardContent>
          <ReconLiveLogPanel jobId={job.id} enabled={isRunning} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Findings ({job.findingsCount})</CardTitle>
        </CardHeader>
        <CardContent>
          <ReconFindingsTable findings={findings} isLoading={findingsLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
