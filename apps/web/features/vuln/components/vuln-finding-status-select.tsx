"use client";

import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/features/i18n/i18n-context";
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

export function VulnFindingStatusSelect({ findingId, status }: { findingId: string; status: VulnFindingStatus }) {
  const { t } = useI18n();
  const updateStatus = useUpdateVulnFindingStatus();

  async function handleChange(next: string): Promise<void> {
    try {
      await updateStatus.mutateAsync({ id: findingId, data: { status: next as VulnFindingStatus } });
      toast.success(t("vuln.finding.markedAs", { status: t(`vuln.status.${next as VulnFindingStatus}` as const) }));
    } catch {
      toast.error(t("vuln.finding.statusError"));
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
            {t(`vuln.status.${option}` as const)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
