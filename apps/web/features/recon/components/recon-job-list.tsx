import Link from "next/link";
import { Radar } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { ReconJobStatusBadge } from "./recon-job-status-badge";
import { formatDistanceToNow } from "@/lib/format";
import type { ReconJobDto } from "@pentesthub/shared";

export function ReconJobList({
  jobs,
  isLoading,
  showTarget = false,
  emptyDescription = "Start a scan to see recon jobs here.",
}: {
  jobs: ReconJobDto[] | undefined;
  isLoading: boolean;
  showTarget?: boolean;
  emptyDescription?: string;
}) {
  if (isLoading) return <ListSkeleton />;

  if (!jobs || jobs.length === 0) {
    return <EmptyState icon={Radar} title="No recon jobs yet" description={emptyDescription} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Tools</TableHead>
          {showTarget && <TableHead>Target</TableHead>}
          <TableHead>Findings</TableHead>
          <TableHead>Started</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id} className="cursor-pointer">
            <TableCell>
              <Link href={`/recon/jobs/${job.id}`} className="flex items-center gap-2 hover:underline">
                <ReconJobStatusBadge status={job.status} />
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/recon/jobs/${job.id}`} className="text-sm text-muted-foreground">
                {job.tools.length} tool{job.tools.length === 1 ? "" : "s"}
              </Link>
            </TableCell>
            {showTarget && (
              <TableCell>
                <Link
                  href={`/targets/${job.targetId}`}
                  className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {job.targetId.slice(0, 8)}…
                </Link>
              </TableCell>
            )}
            <TableCell>
              <Link href={`/recon/jobs/${job.id}`}>{job.findingsCount}</Link>
            </TableCell>
            <TableCell>
              <Link href={`/recon/jobs/${job.id}`} className="text-sm text-muted-foreground">
                {job.startedAt ? formatDistanceToNow(job.startedAt) : "not started"}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
