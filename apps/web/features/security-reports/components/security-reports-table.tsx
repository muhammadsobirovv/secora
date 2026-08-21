"use client";

import Link from "next/link";
import { FileBarChart } from "lucide-react";
import type { SecurityReportDto } from "@pentesthub/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { formatDateTime } from "@/lib/format";
import { SecurityReportTypeBadge } from "./security-report-type-badge";

export function SecurityReportsTable({ reports, isLoading }: { reports: SecurityReportDto[] | undefined; isLoading: boolean }) {
  if (isLoading) return <ListSkeleton rows={5} />;

  if (!reports || reports.length === 0) {
    return (
      <EmptyState
        icon={FileBarChart}
        title="No reports yet"
        description="Generate an incident, threat intel, or posture summary report to see it here."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Period</TableHead>
          <TableHead>Generated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell className="font-medium">
              <Link href={`/security-reports/${report.id}`} className="hover:underline">
                {report.title}
              </Link>
            </TableCell>
            <TableCell>
              <SecurityReportTypeBadge type={report.type} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {report.periodStart && report.periodEnd
                ? `${formatDateTime(report.periodStart)} – ${formatDateTime(report.periodEnd)}`
                : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDateTime(report.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
