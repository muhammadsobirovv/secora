import { Badge } from "@/components/ui/badge";
import type { IncidentSeverity, IncidentStatus } from "@pentesthub/shared";

const SEVERITY_VARIANT: Record<IncidentSeverity, "secondary" | "default" | "warning" | "destructive"> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  CRITICAL: "destructive",
};

export function IncidentSeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return <Badge variant={SEVERITY_VARIANT[severity]}>{severity}</Badge>;
}

const STATUS_VARIANT: Record<IncidentStatus, "destructive" | "warning" | "secondary" | "success" | "outline"> = {
  OPEN: "destructive",
  INVESTIGATING: "warning",
  CONTAINMENT: "warning",
  ERADICATION: "warning",
  RECOVERY: "secondary",
  RESOLVED: "success",
  CLOSED: "outline",
  REOPENED: "destructive",
};

const STATUS_LABEL: Record<IncidentStatus, string> = {
  OPEN: "Open",
  INVESTIGATING: "Investigating",
  CONTAINMENT: "Containment",
  ERADICATION: "Eradication",
  RECOVERY: "Recovery",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
