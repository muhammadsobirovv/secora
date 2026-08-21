"use client";

import { ShieldAlert } from "lucide-react";
import type { IncidentDto } from "@pentesthub/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { formatDistanceToNow } from "@/lib/format";
import { IncidentSeverityBadge, IncidentStatusBadge } from "./incident-badges";

/// Read-only — no incident detail page exists yet (out of scope for
/// #480, see use-soc.ts's own doc comment), so rows are not links.
export function IncidentsTable({ incidents, isLoading }: { incidents: IncidentDto[] | undefined; isLoading: boolean }) {
  if (isLoading) return <ListSkeleton rows={6} />;

  if (!incidents || incidents.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No incidents"
        description="Security incidents opened for this workspace will appear here."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Assignee</TableHead>
          <TableHead>Opened</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {incidents.map((incident) => (
          <TableRow key={incident.id}>
            <TableCell className="max-w-sm truncate font-medium">{incident.title}</TableCell>
            <TableCell>
              <IncidentSeverityBadge severity={incident.severity} />
            </TableCell>
            <TableCell>
              <IncidentStatusBadge status={incident.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{incident.assigneeId ?? "Unassigned"}</TableCell>
            <TableCell className="text-muted-foreground">{formatDistanceToNow(incident.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
