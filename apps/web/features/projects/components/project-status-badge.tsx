"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/features/i18n/i18n-context";
import type { ProjectStatus } from "@pentesthub/shared";

const STATUS_VARIANT: Record<ProjectStatus, "default" | "secondary" | "success" | "outline"> = {
  ACTIVE: "success",
  ON_HOLD: "secondary",
  COMPLETED: "default",
  ARCHIVED: "outline",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useI18n();
  const label = {
    ACTIVE: t("projectStatus.ACTIVE"),
    ON_HOLD: t("projectStatus.ON_HOLD"),
    COMPLETED: t("projectStatus.COMPLETED"),
    ARCHIVED: t("projectStatus.ARCHIVED"),
  }[status];
  return <Badge variant={STATUS_VARIANT[status]}>{label}</Badge>;
}
