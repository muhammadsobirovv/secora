import { Badge } from "@/components/ui/badge";
import type { VulnFindingStatus } from "@pentesthub/shared";

const STATUS_VARIANT: Record<
  VulnFindingStatus,
  "default" | "secondary" | "success" | "destructive" | "warning" | "outline"
> = {
  NEW: "default",
  CONFIRMED: "warning",
  DUPLICATE: "outline",
  ACCEPTED_RISK: "secondary",
  FIXED: "success",
  FALSE_POSITIVE: "outline",
};

const STATUS_LABEL: Record<VulnFindingStatus, string> = {
  NEW: "New",
  CONFIRMED: "Confirmed",
  DUPLICATE: "Duplicate",
  ACCEPTED_RISK: "Accepted risk",
  FIXED: "Fixed",
  FALSE_POSITIVE: "False positive",
};

export function VulnFindingStatusBadge({ status }: { status: VulnFindingStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
