import { Badge } from "@/components/ui/badge";
import type { TargetType } from "@pentesthub/shared";

const TYPE_LABEL: Record<TargetType, string> = {
  DOMAIN: "Domain",
  SUBDOMAIN: "Subdomain",
  URL: "URL",
  IP_ADDRESS: "IP",
  CIDR: "CIDR",
  API: "API",
  MOBILE_APP: "Mobile app",
  INTERNAL_ASSET: "Internal asset",
};

export function TargetTypeBadge({ type }: { type: TargetType }) {
  return <Badge variant="secondary">{TYPE_LABEL[type]}</Badge>;
}
