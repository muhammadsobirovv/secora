import { Badge } from "@/components/ui/badge";
import type { RemediationPriority, RemediationStatus } from "@pentesthub/shared";

const STATUS_VARIANT: Record<
  RemediationStatus,
  "default" | "secondary" | "success" | "destructive" | "warning" | "outline"
> = {
  OPEN: "default",
  IN_PROGRESS: "warning",
  BLOCKED: "destructive",
  READY_FOR_VERIFICATION: "secondary",
  VERIFIED: "success",
  CLOSED: "outline",
};

const STATUS_LABEL: Record<RemediationStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  READY_FOR_VERIFICATION: "Ready for verification",
  VERIFIED: "Verified",
  CLOSED: "Closed",
};

export function RemediationStatusBadge({ status }: { status: RemediationStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

const PRIORITY_VARIANT: Record<RemediationPriority, "default" | "secondary" | "destructive" | "warning"> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  CRITICAL: "destructive",
};

const PRIORITY_LABEL: Record<RemediationPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export function RemediationPriorityBadge({ priority }: { priority: RemediationPriority }) {
  return <Badge variant={PRIORITY_VARIANT[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}
