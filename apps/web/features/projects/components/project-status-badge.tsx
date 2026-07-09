import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@pentesthub/shared";

const STATUS_VARIANT: Record<ProjectStatus, "default" | "secondary" | "success" | "outline"> = {
  ACTIVE: "success",
  ON_HOLD: "secondary",
  COMPLETED: "default",
  ARCHIVED: "outline",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
