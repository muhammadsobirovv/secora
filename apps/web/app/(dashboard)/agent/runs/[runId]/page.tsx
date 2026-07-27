"use client";

import { use } from "react";
import { toast } from "sonner";
import { Bot, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/common/error-state";
import {
  useCancelOrchestrationRun,
  useOrchestrationRun,
  useOrchestrationRunExplanation,
  useRetryOrchestrationRun,
} from "@/features/agent/hooks/use-agent";
import { AgentRunStatusBadge } from "@/features/agent/components/agent-run-status-badge";
import { AgentRunStreamPanel } from "@/features/agent/components/agent-run-stream-panel";
import { AgentTaskTree } from "@/features/agent/components/agent-task-tree";
import { AgentRunExplanation } from "@/features/agent/components/agent-run-explanation";
import { formatDateTime } from "@/lib/format";
import type { OrchestrationRunStatus } from "@pentesthub/shared";

const TERMINAL_STATUSES: OrchestrationRunStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];
const CANCELLABLE_STATUSES: OrchestrationRunStatus[] = ["PENDING", "PLANNING", "RUNNING", "PAUSED"];

export default function AgentRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const { data: run, isLoading, isError, refetch } = useOrchestrationRun(runId);
  const isTerminal = Boolean(run && TERMINAL_STATUSES.includes(run.status));
  const { data: explanation, isLoading: explanationLoading } = useOrchestrationRunExplanation(
    runId,
    Boolean(run),
  );
  const cancelRun = useCancelOrchestrationRun();
  const retryRun = useRetryOrchestrationRun();

  async function handleCancel(): Promise<void> {
    try {
      await cancelRun.mutateAsync(runId);
      toast.success("Cancellation requested");
    } catch {
      toast.error("Couldn't cancel this run.");
    }
  }

  async function handleRetry(): Promise<void> {
    try {
      await retryRun.mutateAsync(runId);
      toast.success("Run queued for retry");
    } catch {
      toast.error("Couldn't retry this run.");
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

  if (isError || !run) {
    return <ErrorState description="Couldn't load this orchestration run." onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="size-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Orchestration run</h1>
            <AgentRunStatusBadge status={run.status} />
          </div>
          <p className="mt-1 max-w-xl text-sm text-foreground">{run.goal}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{run.id}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {run.startedAt && <span>Started {formatDateTime(run.startedAt)}</span>}
            {run.finishedAt && <span>Finished {formatDateTime(run.finishedAt)}</span>}
          </div>
          {run.errorMessage && <p className="mt-2 text-sm text-destructive">{run.errorMessage}</p>}
          {run.resultSummary && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{run.resultSummary}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {CANCELLABLE_STATUSES.includes(run.status) && (
            <Button size="sm" variant="outline" disabled={cancelRun.isPending} onClick={() => void handleCancel()}>
              {cancelRun.isPending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
              Cancel
            </Button>
          )}
          {run.status === "FAILED" && (
            <Button size="sm" disabled={retryRun.isPending} onClick={() => void handleRetry()}>
              {retryRun.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Retry
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live activity</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentRunStreamPanel runId={run.id} enabled={!isTerminal} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="tasks">
            <TabsList>
              <TabsTrigger value="tasks">Task tree</TabsTrigger>
              <TabsTrigger value="explanation">Explainability</TabsTrigger>
            </TabsList>
            <TabsContent value="tasks" className="pt-4">
              <AgentTaskTree tasks={run.tasks} />
            </TabsContent>
            <TabsContent value="explanation" className="pt-4">
              {explanationLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : explanation ? (
                <AgentRunExplanation explanation={explanation} />
              ) : (
                <p className="text-sm text-muted-foreground">No explanation available yet.</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
