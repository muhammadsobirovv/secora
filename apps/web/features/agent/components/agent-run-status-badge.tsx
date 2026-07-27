import { Badge } from "@/components/ui/badge";
import type { AgentTaskStatus, OrchestrationRunStatus } from "@pentesthub/shared";

const RUN_STATUS_VARIANT: Record<
  OrchestrationRunStatus,
  "default" | "secondary" | "success" | "destructive" | "warning" | "outline"
> = {
  PENDING: "secondary",
  PLANNING: "secondary",
  RUNNING: "default",
  PAUSED: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "outline",
};

const RUN_STATUS_LABEL: Record<OrchestrationRunStatus, string> = {
  PENDING: "Pending",
  PLANNING: "Planning",
  RUNNING: "Running",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function AgentRunStatusBadge({ status }: { status: OrchestrationRunStatus }) {
  return <Badge variant={RUN_STATUS_VARIANT[status]}>{RUN_STATUS_LABEL[status]}</Badge>;
}

const TASK_STATUS_VARIANT: Record<
  AgentTaskStatus,
  "default" | "secondary" | "success" | "destructive" | "warning" | "outline"
> = {
  QUEUED: "secondary",
  RUNNING: "default",
  RETRYING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "outline",
};

const TASK_STATUS_LABEL: Record<AgentTaskStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  RETRYING: "Retrying",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function AgentTaskStatusBadge({ status }: { status: AgentTaskStatus }) {
  return <Badge variant={TASK_STATUS_VARIANT[status]}>{TASK_STATUS_LABEL[status]}</Badge>;
}
