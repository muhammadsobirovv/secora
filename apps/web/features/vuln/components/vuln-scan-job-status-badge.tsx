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

/// A finished scan whose stages could not all run is shown as "Completed with
/// errors" (amber), never as a plain green "Completed".
export function VulnScanJobStatusBadge({ status, completedWithErrors = false }: { status: VulnScanJobStatus; completedWithErrors?: boolean }) {
  const { t } = useI18n();
  if (status === "COMPLETED" && completedWithErrors) {
    return <Badge variant="warning">{t("vuln.jobStatus.COMPLETED_WITH_ERRORS")}</Badge>;
  }
  return <Badge variant={STATUS_VARIANT[status]}>{t(`vuln.jobStatus.${status}` as const)}</Badge>;
}
