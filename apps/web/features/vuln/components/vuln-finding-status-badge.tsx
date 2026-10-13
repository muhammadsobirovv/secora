"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/features/i18n/i18n-context";
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

export function VulnFindingStatusBadge({ status }: { status: VulnFindingStatus }) {
  const { t } = useI18n();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`vuln.status.${status}` as const)}</Badge>;
}
