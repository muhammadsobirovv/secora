import { Badge } from "@/components/ui/badge";
import type { SecurityReportType } from "@pentesthub/shared";

const TYPE_LABEL: Record<SecurityReportType, string> = {
  INCIDENT_SUMMARY: "Incident Summary",
  THREAT_INTEL_SUMMARY: "Threat Intel Summary",
  POSTURE_SUMMARY: "Posture Summary",
};

export function SecurityReportTypeBadge({ type }: { type: SecurityReportType }) {
  return <Badge variant="outline">{TYPE_LABEL[type]}</Badge>;
}
