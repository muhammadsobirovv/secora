"use client";

import { TrendingUp } from "lucide-react";
import type { SecurityMetricsTrendPointDto } from "@pentesthub/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { formatDate } from "@/lib/format";

/// Dependency-free table (no charting library wired into apps/web — see
/// VulnSeverityChart's own doc comment for the same constraint) — weekly
/// MTTR/SLA-compliance figures from `SecurityMetricsService.trend()`,
/// most recent week first.
export function SecurityMetricsTrendTable({
  points,
  isLoading,
}: {
  points: SecurityMetricsTrendPointDto[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return <ListSkeleton rows={4} />;

  if (!points || points.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No trend data yet"
        description="Weekly figures appear here once incidents and SLA clocks have resolved."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Week</TableHead>
          <TableHead>Incidents resolved</TableHead>
          <TableHead>MTTR (incident)</TableHead>
          <TableHead>SLA compliance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...points].reverse().map((point) => (
          <TableRow key={point.periodStart}>
            <TableCell className="text-muted-foreground">
              {formatDate(point.periodStart)} – {formatDate(point.periodEnd)}
            </TableCell>
            <TableCell>{point.incidentsResolved}</TableCell>
            <TableCell>{point.mttrIncidentHours != null ? `${point.mttrIncidentHours.toFixed(1)}h` : "—"}</TableCell>
            <TableCell>
              {point.slaComplianceRate != null ? `${(point.slaComplianceRate * 100).toFixed(0)}%` : "—"}
              {point.slaEventsResolved > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({point.slaEventsResolved})</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
