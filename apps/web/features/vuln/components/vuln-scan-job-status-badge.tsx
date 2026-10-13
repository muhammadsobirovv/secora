"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/features/i18n/i18n-context";
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

export function VulnScanJobStatusBadge({ status }: { status: VulnScanJobStatus }) {
  const { t } = useI18n();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`vuln.jobStatus.${status}` as const)}</Badge>;
}
