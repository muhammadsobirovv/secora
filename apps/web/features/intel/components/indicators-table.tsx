"use client";

import { Radar } from "lucide-react";
import type { IndicatorDto } from "@pentesthub/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { formatDate } from "@/lib/format";
import { IndicatorStatusBadge, IndicatorTypeBadge } from "./indicator-badges";
import { IndicatorStatusSelect } from "./indicator-status-select";

export function IndicatorsTable({
  indicators,
  isLoading,
  workspaceId,
}: {
  indicators: IndicatorDto[] | undefined;
  isLoading: boolean;
  /// This workspace's own id — only rows with a matching `workspaceId`
  /// get an editable status control; public/shared-cache rows
  /// (`workspaceId: null`) are read-only from every workspace.
  workspaceId: string | undefined;
}) {
  if (isLoading) return <ListSkeleton rows={8} />;

  if (!indicators || indicators.length === 0) {
    return (
      <EmptyState
        icon={Radar}
        title="No indicators yet"
        description="Indicators appear here from provider refreshes, STIX/TAXII imports, or manual entry."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Value</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Last seen</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {indicators.map((indicator) => {
          const isOwnWorkspaceIndicator = Boolean(workspaceId) && indicator.workspaceId === workspaceId;
          return (
            <TableRow key={indicator.id}>
              <TableCell className="max-w-xs truncate font-mono text-xs">{indicator.value}</TableCell>
              <TableCell>
                <IndicatorTypeBadge type={indicator.type} />
              </TableCell>
              <TableCell className="text-muted-foreground">{Math.round(indicator.confidence * 100)}%</TableCell>
              <TableCell className="text-muted-foreground">{indicator.source}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(indicator.lastSeenAt)}</TableCell>
              <TableCell>
                {isOwnWorkspaceIndicator ? (
                  <IndicatorStatusSelect indicatorId={indicator.id} status={indicator.status} />
                ) : (
                  <IndicatorStatusBadge status={indicator.status} />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
