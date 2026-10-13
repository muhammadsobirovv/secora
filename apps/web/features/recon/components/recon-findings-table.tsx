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
import { useI18n } from "@/features/i18n/i18n-context";
import { usePromoteReconFinding } from "../hooks/use-recon";

const ALL_TYPES: ReconFindingType[] = [
  "SUBDOMAIN",
  "URL",
  "OPEN_PORT",
  "SERVICE",
  "TECHNOLOGY",
  "DNS_RECORD",
  "HTTP_HEADER",
  "CERTIFICATE",
  "SCREENSHOT",
  "SECURITY_HEADER",
  "WHOIS_RECORD",
  "ASN",
];

export function ReconFindingsTable({
  findings,
  isLoading,
}: {
  findings: ReconFindingDto[] | undefined;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  const [typeFilter, setTypeFilter] = React.useState<ReconFindingType | "ALL">("ALL");
  const promote = usePromoteReconFinding();

  const filtered = React.useMemo(() => {
    if (!findings) return [];
    return typeFilter === "ALL" ? findings : findings.filter((f) => f.type === typeFilter);
  }, [findings, typeFilter]);

  const presentTypes = React.useMemo(
    () => ALL_TYPES.filter((type) => findings?.some((f) => f.type === type)),
    [findings],
  );

  async function handlePromote(finding: ReconFindingDto): Promise<void> {
    try {
      await promote.mutateAsync({ id: finding.id });
      toast.success(t("recon.findings.promoteSuccess", { value: finding.value }));
    } catch {
      toast.error(t("recon.findings.promoteError"));
    }
  }

  if (isLoading) return <ListSkeleton />;

  if (!findings || findings.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("recon.findings.emptyTitle")}
        description={t("recon.findings.emptyDescription")}
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
            <SelectItem value="ALL">{t("recon.findings.allTypes", { count: findings.length })}</SelectItem>
            {presentTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`recon.findingType.${type}` as const)} ({findings.filter((f) => f.type === type).length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("recon.findings.col.type")}</TableHead>
            <TableHead>{t("recon.findings.col.value")}</TableHead>
            <TableHead>{t("recon.findings.col.source")}</TableHead>
            <TableHead>{t("recon.findings.col.lastSeen")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((finding) => {
            const promotable = Boolean(FINDING_TYPE_TO_TARGET_TYPE[finding.type]);
            return (
              <TableRow key={finding.id}>
                <TableCell>
                  <Badge variant="outline">{t(`recon.findingType.${finding.type}` as const)}</Badge>
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
                      <Badge variant="secondary">{t("recon.findings.promoted")}</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={promote.isPending}
                        onClick={() => void handlePromote(finding)}
                      >
                        {promote.isPending && <Loader2 className="size-3.5 animate-spin" />}
                        {t("recon.findings.promote")}
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
