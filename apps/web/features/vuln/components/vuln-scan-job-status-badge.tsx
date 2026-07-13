import { Badge } from "@/components/ui/badge";
import type { VulnScanJobStatus } from "@pentesthub/shared";

const STATUS_VARIANT: Record<
  VulnScanJobStatus,
  "default" | "secondary" | "success" | "destructive" | "warning" | "outline"
> = {
  PENDING: "secondary",
  RUNNING: "default",
  PAUSED: "outline",
  RETRYING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "outline",
};

const STATUS_LABEL: Record<VulnScanJobStatus, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  PAUSED: "Paused",
  RETRYING: "Retrying",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function VulnScanJobStatusBadge({ status }: { status: VulnScanJobStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
