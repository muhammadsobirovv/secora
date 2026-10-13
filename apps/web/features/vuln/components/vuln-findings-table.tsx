"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, SearchX } from "lucide-react";
import { toast } from "sonner";
import type { VulnFindingDto, VulnFindingStatus } from "@pentesthub/shared";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { formatDistanceToNow } from "@/lib/format";
import { useI18n } from "@/features/i18n/i18n-context";
import { VulnFindingSeverityBadge } from "./vuln-finding-severity-badge";
import { VulnFindingStatusBadge } from "./vuln-finding-status-badge";
import { useBulkUpdateVulnFindings } from "../hooks/use-vuln";

const BULK_STATUS_OPTIONS: VulnFindingStatus[] = [
  "CONFIRMED",
  "DUPLICATE",
  "ACCEPTED_RISK",
  "FIXED",
  "FALSE_POSITIVE",
];

/// Shared table for both the job-detail findings list (no bulk actions,
/// `enableBulkActions={false}`) and the workspace-wide Findings page
/// (bulk status updates via checkboxes — "Bulk Actions" from the Module 4
/// frontend spec). Filtering/search live in the caller (the Findings page
/// drives them through useVulnFindings' query params so the API does the
/// filtering, not this component) — this table only ever renders whatever
/// array it's given.
export function VulnFindingsTable({
  findings,
  isLoading,
  showTarget = false,
  enableBulkActions = false,
  emptyDescription,
}: {
  findings: VulnFindingDto[] | undefined;
  isLoading: boolean;
  showTarget?: boolean;
  enableBulkActions?: boolean;
  emptyDescription?: string;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const bulkUpdate = useBulkUpdateVulnFindings();

  // Keyboard shortcuts: Escape clears the current selection, Ctrl/Cmd+A
  // selects everything currently rendered — scoped to when bulk actions
  // are enabled (the Findings page) so the job-detail table's plain list
  // doesn't hijack browser shortcuts for no reason.
  React.useEffect(() => {
    if (!enableBulkActions || !findings) return;
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.key === "Escape") {
        setSelected(new Set());
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && findings) {
        e.preventDefault();
        setSelected(new Set(findings.map((f) => f.id)));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enableBulkActions, findings]);

  function toggleOne(id: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean): void {
    setSelected(checked && findings ? new Set(findings.map((f) => f.id)) : new Set());
  }

  async function handleBulkStatus(status: VulnFindingStatus): Promise<void> {
    try {
      await bulkUpdate.mutateAsync({ findingIds: [...selected], status });
      toast.success(t("vuln.bulk.updated", { status: t(`vuln.status.${status}` as const), count: selected.size }));
      setSelected(new Set());
    } catch {
      toast.error(t("vuln.bulk.error"));
    }
  }

  if (isLoading) return <ListSkeleton />;

  if (!findings || findings.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("vuln.findings.emptyTitle")}
        description={emptyDescription ?? t("vuln.findings.emptyDescription")}
      />
    );
  }

  const allSelected = enableBulkActions && findings.length > 0 && selected.size === findings.length;

  return (
    <div className="flex flex-col gap-3">
      {enableBulkActions && selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {t("vuln.bulk.selected", { count: selected.size })}{" "}
            <span className="text-xs">{t("vuln.bulk.escToClear")}</span>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={bulkUpdate.isPending}>
                {bulkUpdate.isPending && <Loader2 className="size-3.5 animate-spin" />}
                {t("vuln.bulk.setStatus")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {BULK_STATUS_OPTIONS.map((status) => (
                <DropdownMenuItem key={status} onSelect={() => void handleBulkStatus(status)}>
                  {t(`vuln.status.${status}` as const)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {enableBulkActions && (
              <TableHead className="w-8">
                <Checkbox checked={allSelected} onCheckedChange={(c) => toggleAll(c === true)} />
              </TableHead>
            )}
            <TableHead>{t("vuln.findings.col.severity")}</TableHead>
            <TableHead>{t("vuln.findings.col.title")}</TableHead>
            <TableHead>{t("vuln.findings.col.scanner")}</TableHead>
            {showTarget && <TableHead>{t("vuln.findings.col.target")}</TableHead>}
            <TableHead>{t("vuln.findings.col.status")}</TableHead>
            <TableHead>{t("vuln.findings.col.lastSeen")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((finding) => (
            <TableRow key={finding.id} data-state={selected.has(finding.id) ? "selected" : undefined}>
              {enableBulkActions && (
                <TableCell>
                  <Checkbox
                    checked={selected.has(finding.id)}
                    onCheckedChange={(c) => toggleOne(finding.id, c === true)}
                  />
                </TableCell>
              )}
              <TableCell>
                <VulnFindingSeverityBadge severity={finding.severity} />
              </TableCell>
              <TableCell className="max-w-sm">
                <Link href={`/vuln/findings/${finding.id}`} className="hover:underline">
                  <span className="line-clamp-1 text-sm font-medium">{finding.title}</span>
                  {finding.path && (
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {finding.path}
                    </span>
                  )}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{finding.scanner}</Badge>
              </TableCell>
              {showTarget && (
                <TableCell>
                  <Link
                    href={`/targets/${finding.targetId}`}
                    className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {finding.targetId.slice(0, 8)}…
                  </Link>
                </TableCell>
              )}
              <TableCell>
                <VulnFindingStatusBadge status={finding.status} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDistanceToNow(finding.lastSeenAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
