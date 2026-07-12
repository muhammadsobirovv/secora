"use client";

import * as React from "react";
import { Loader2, SearchX } from "lucide-react";
import { toast } from "sonner";
import { FINDING_TYPE_TO_TARGET_TYPE } from "@pentesthub/shared";
import type { ReconFindingDto, ReconFindingType } from "@pentesthub/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { formatDistanceToNow } from "@/lib/format";
import { usePromoteReconFinding } from "../hooks/use-recon";

const TYPE_LABEL: Record<ReconFindingType, string> = {
  SUBDOMAIN: "Subdomain",
  URL: "URL",
  OPEN_PORT: "Open port",
  SERVICE: "Service",
  TECHNOLOGY: "Technology",
  DNS_RECORD: "DNS record",
  HTTP_HEADER: "HTTP header",
  CERTIFICATE: "Certificate",
  SCREENSHOT: "Screenshot",
  SECURITY_HEADER: "Security header",
  WHOIS_RECORD: "WHOIS",
  ASN: "ASN",
};

const ALL_TYPES = Object.keys(TYPE_LABEL) as ReconFindingType[];

export function ReconFindingsTable({
  findings,
  isLoading,
}: {
  findings: ReconFindingDto[] | undefined;
  isLoading: boolean;
}) {
  const [typeFilter, setTypeFilter] = React.useState<ReconFindingType | "ALL">("ALL");
  const promote = usePromoteReconFinding();

  const filtered = React.useMemo(() => {
    if (!findings) return [];
    return typeFilter === "ALL" ? findings : findings.filter((f) => f.type === typeFilter);
  }, [findings, typeFilter]);

  const presentTypes = React.useMemo(
    () => ALL_TYPES.filter((t) => findings?.some((f) => f.type === t)),
    [findings],
  );

  async function handlePromote(finding: ReconFindingDto): Promise<void> {
    try {
      await promote.mutateAsync({ id: finding.id });
      toast.success(`Promoted "${finding.value}" to a target`);
    } catch {
      toast.error("Couldn't promote this finding.");
    }
  }

  if (isLoading) return <ListSkeleton />;

  if (!findings || findings.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="No findings yet"
        description="Findings appear here as tools complete — domains, ports, technologies, and more."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ReconFindingType | "ALL")}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types ({findings.length})</SelectItem>
            {presentTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {TYPE_LABEL[type]} ({findings.filter((f) => f.type === type).length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((finding) => {
            const promotable = Boolean(FINDING_TYPE_TO_TARGET_TYPE[finding.type]);
            return (
              <TableRow key={finding.id}>
                <TableCell>
                  <Badge variant="outline">{TYPE_LABEL[finding.type]}</Badge>
                </TableCell>
                <TableCell className="max-w-md truncate font-mono text-xs" title={finding.value}>
                  {finding.value}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{finding.source}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(finding.lastSeenAt)}
                </TableCell>
                <TableCell>
                  {promotable &&
                    (finding.promotedTargetId ? (
                      <Badge variant="secondary">Promoted</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={promote.isPending}
                        onClick={() => void handlePromote(finding)}
                      >
                        {promote.isPending && <Loader2 className="size-3.5 animate-spin" />}
                        Promote
                      </Button>
                    ))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
