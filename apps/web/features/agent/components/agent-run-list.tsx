import Link from "next/link";
import { Bot } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { AgentRunStatusBadge } from "./agent-run-status-badge";
import { formatDistanceToNow } from "@/lib/format";
import type { OrchestrationRunSummaryDto } from "@pentesthub/shared";

export function AgentRunList({
  runs,
  isLoading,
  emptyDescription = "Start a run to see it here.",
}: {
  runs: OrchestrationRunSummaryDto[] | undefined;
  isLoading: boolean;
  emptyDescription?: string;
}) {
  if (isLoading) return <ListSkeleton />;

  if (!runs || runs.length === 0) {
    return <EmptyState icon={Bot} title="No orchestration runs yet" description={emptyDescription} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Goal</TableHead>
          <TableHead>Tasks</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Started</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id} className="cursor-pointer">
            <TableCell>
              <Link href={`/agent/runs/${run.id}`} className="flex items-center gap-2 hover:underline">
                <AgentRunStatusBadge status={run.status} />
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/agent/runs/${run.id}`} className="line-clamp-1 max-w-sm text-sm">
                {run.goal}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/agent/runs/${run.id}`} className="text-sm text-muted-foreground">
                {run.completedTaskCount}/{run.taskCount}
                {run.failedTaskCount > 0 ? ` (${run.failedTaskCount} failed)` : ""}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/agent/runs/${run.id}`} className="text-sm text-muted-foreground">
                {run.confidenceScore !== null ? `${Math.round(run.confidenceScore * 100)}%` : "—"}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/agent/runs/${run.id}`} className="text-sm text-muted-foreground">
                {run.startedAt ? formatDistanceToNow(run.startedAt) : "not started"}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
