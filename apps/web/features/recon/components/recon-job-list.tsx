"use client";

import Link from "next/link";
import { Radar } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { ReconJobStatusBadge } from "./recon-job-status-badge";
import { formatDistanceToNow } from "@/lib/format";
import { useI18n } from "@/features/i18n/i18n-context";
import type { ReconJobDto } from "@pentesthub/shared";

export function ReconJobList({
  jobs,
  isLoading,
  showTarget = false,
  emptyDescription,
}: {
  jobs: ReconJobDto[] | undefined;
  isLoading: boolean;
  showTarget?: boolean;
  emptyDescription?: string;
}) {
  const { t } = useI18n();
  if (isLoading) return <ListSkeleton />;

  if (!jobs || jobs.length === 0) {
    return (
      <EmptyState
        icon={Radar}
        title={t("recon.list.emptyTitle")}
        description={emptyDescription ?? t("recon.list.emptyDescription")}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("recon.list.status")}</TableHead>
          <TableHead>{t("recon.list.tools")}</TableHead>
          {showTarget && <TableHead>{t("recon.list.target")}</TableHead>}
          <TableHead>{t("recon.list.findings")}</TableHead>
          <TableHead>{t("recon.list.started")}</TableHead>
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
                {job.tools.length}
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
                {job.startedAt ? formatDistanceToNow(job.startedAt) : t("recon.list.notStarted")}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
