"use client";

import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateVulnFindingStatus } from "../hooks/use-vuln";
import type { VulnFindingStatus } from "@pentesthub/shared";

const STATUS_OPTIONS: VulnFindingStatus[] = [
  "NEW",
  "CONFIRMED",
  "DUPLICATE",
  "ACCEPTED_RISK",
  "FIXED",
  "FALSE_POSITIVE",
];

const STATUS_LABEL: Record<VulnFindingStatus, string> = {
  NEW: "New",
  CONFIRMED: "Confirmed",
  DUPLICATE: "Duplicate",
  ACCEPTED_RISK: "Accepted risk",
  FIXED: "Fixed",
  FALSE_POSITIVE: "False positive",
};

export function VulnFindingStatusSelect({ findingId, status }: { findingId: string; status: VulnFindingStatus }) {
  const updateStatus = useUpdateVulnFindingStatus();

  async function handleChange(next: string): Promise<void> {
    try {
      await updateStatus.mutateAsync({ id: findingId, data: { status: next as VulnFindingStatus } });
      toast.success(`Marked as ${STATUS_LABEL[next as VulnFindingStatus]}`);
    } catch {
      toast.error("Couldn't update this finding's status.");
    }
  }

  return (
    <Select value={status} onValueChange={(v) => void handleChange(v)} disabled={updateStatus.isPending}>
      <SelectTrigger className="w-44">
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
