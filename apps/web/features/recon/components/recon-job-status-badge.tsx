"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/features/i18n/i18n-context";
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

export function ReconJobStatusBadge({ status }: { status: ReconJobStatus }) {
  const { t } = useI18n();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`recon.status.${status}` as const)}</Badge>;
}
