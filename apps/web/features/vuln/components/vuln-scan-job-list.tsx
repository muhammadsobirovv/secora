import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { VulnScanJobStatusBadge } from "./vuln-scan-job-status-badge";
import { formatDistanceToNow } from "@/lib/format";
import type { VulnScanJobDto } from "@pentesthub/shared";

export function VulnScanJobList({
  jobs,
  isLoading,
  showTarget = false,
  emptyDescription = "Start a scan to see vulnerability scan jobs here.",
}: {
  jobs: VulnScanJobDto[] | undefined;
  isLoading: boolean;
  showTarget?: boolean;
  emptyDescription?: string;
}) {
  if (isLoading) return <ListSkeleton />;

  if (!jobs || jobs.length === 0) {
    return <EmptyState icon={ShieldAlert} title="No scan jobs yet" description={emptyDescription} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Scanners</TableHead>
          {showTarget && <TableHead>Target</TableHead>}
          <TableHead>Priority</TableHead>
          <TableHead>Findings</TableHead>
          <TableHead>Started</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id} className="cursor-pointer">
            <TableCell>
              <Link href={`/vuln/jobs/${job.id}`} className="flex items-center gap-2 hover:underline">
                <VulnScanJobStatusBadge status={job.status} />
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/vuln/jobs/${job.id}`} className="text-sm text-muted-foreground">
                {job.scanners.length} scanner{job.scanners.length === 1 ? "" : "s"}
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
              <Link href={`/vuln/jobs/${job.id}`} className="text-sm text-muted-foreground">
                {job.priority}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/vuln/jobs/${job.id}`}>{job.findingsCount}</Link>
            </TableCell>
            <TableCell>
              <Link href={`/vuln/jobs/${job.id}`} className="text-sm text-muted-foreground">
                {job.startedAt ? formatDistanceToNow(job.startedAt) : "not started"}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
