import { Badge } from "@/components/ui/badge";
import type { ReconJobStatus } from "@pentesthub/shared";

const STATUS_VARIANT: Record<
  ReconJobStatus,
  "default" | "secondary" | "success" | "destructive" | "warning" | "outline"
> = {
  PENDING: "secondary",
  RUNNING: "default",
  RETRYING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "outline",
};

const STATUS_LABEL: Record<ReconJobStatus, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  RETRYING: "Retrying",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function ReconJobStatusBadge({ status }: { status: ReconJobStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
