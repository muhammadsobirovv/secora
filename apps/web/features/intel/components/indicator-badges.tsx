import { Badge } from "@/components/ui/badge";
import type { IndicatorStatus, IndicatorType } from "@pentesthub/shared";

const STATUS_VARIANT: Record<IndicatorStatus, "success" | "secondary" | "outline"> = {
  ACTIVE: "success",
  EXPIRED: "outline",
  DISABLED: "secondary",
};

const STATUS_LABEL: Record<IndicatorStatus, string> = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  DISABLED: "Disabled",
};

export function IndicatorStatusBadge({ status }: { status: IndicatorStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

const TYPE_LABEL: Record<IndicatorType, string> = {
  IP: "IP",
  DOMAIN: "Domain",
  URL: "URL",
  HASH: "Hash",
  EMAIL: "Email",
  CVE: "CVE",
  CPE: "CPE",
  ASN: "ASN",
  CERTIFICATE: "Certificate",
  FILE: "File",
  MALWARE_FAMILY: "Malware family",
};

export function IndicatorTypeBadge({ type }: { type: IndicatorType }) {
  return <Badge variant="outline">{TYPE_LABEL[type]}</Badge>;
}
