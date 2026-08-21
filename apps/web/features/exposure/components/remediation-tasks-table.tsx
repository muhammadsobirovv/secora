"use client";

import { ClipboardCheck } from "lucide-react";
import type { RemediationTaskDto } from "@pentesthub/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { formatDate } from "@/lib/format";
import { RemediationPriorityBadge, RemediationStatusBadge } from "./remediation-status-badge";

const OPEN_LIKE_STATUSES = new Set(["OPEN", "IN_PROGRESS", "BLOCKED", "READY_FOR_VERIFICATION"]);

function isOverdue(task: RemediationTaskDto): boolean {
  if (!task.dueDate || !OPEN_LIKE_STATUSES.has(task.status)) return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

/// Read-only summary table — the Exposure Management dashboard (task
/// #476) is a landing view, not the Remediation task-management surface
/// itself (no dedicated `/remediation` page/detail route exists yet).
/// Rows are purely informational here; editing a task's status/owner
/// happens wherever that page eventually lands.
export function RemediationTasksTable({
  tasks,
  isLoading,
}: {
  tasks: RemediationTaskDto[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return <ListSkeleton rows={5} />;

  if (!tasks || tasks.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No remediation tasks yet"
        description="Tasks appear here once findings or incidents are assigned for remediation."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell className="max-w-xs truncate font-medium">
              {task.notes || task.findingId || task.incidentId || task.id}
            </TableCell>
            <TableCell>
              <RemediationPriorityBadge priority={task.priority} />
            </TableCell>
            <TableCell>
              <RemediationStatusBadge status={task.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{task.owner ?? "Unassigned"}</TableCell>
            <TableCell className={isOverdue(task) ? "font-medium text-destructive" : "text-muted-foreground"}>
              {task.dueDate ? formatDate(task.dueDate) : "—"}
              {isOverdue(task) && " (overdue)"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
