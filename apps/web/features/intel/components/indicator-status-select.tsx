"use client";

import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSetIndicatorStatus } from "../hooks/use-indicators";
import type { IndicatorStatus } from "@pentesthub/shared";

const STATUS_OPTIONS: IndicatorStatus[] = ["ACTIVE", "EXPIRED", "DISABLED"];

const STATUS_LABEL: Record<IndicatorStatus, string> = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  DISABLED: "Disabled",
};

/// Only this workspace's own private indicators can have their status
/// changed here (`ThreatIntelController.updateIndicatorStatus` scopes
/// the write to the caller's workspace) — public/shared-cache indicators
/// (`workspaceId: null`) are read-only from every workspace's point of
/// view, so callers must not render this for those rows.
export function IndicatorStatusSelect({ indicatorId, status }: { indicatorId: string; status: IndicatorStatus }) {
  const setStatus = useSetIndicatorStatus();

  async function handleChange(next: string): Promise<void> {
    try {
      await setStatus.mutateAsync({ id: indicatorId, data: { status: next as IndicatorStatus } });
      toast.success(`Marked as ${STATUS_LABEL[next as IndicatorStatus]}`);
    } catch {
      toast.error("Couldn't update this indicator's status.");
    }
  }

  return (
    <Select value={status} onValueChange={(v) => void handleChange(v)} disabled={setStatus.isPending}>
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option} value={option}>
            {STATUS_LABEL[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
