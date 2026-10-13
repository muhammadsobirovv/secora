"use client";

import * as React from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { scanErrorMessage } from "@/features/targets/scan-error-message";
import { useI18n } from "@/features/i18n/i18n-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { VulnScannerSelectList } from "./vuln-scanner-select-list";
import { useCreateVulnScanJob } from "../hooks/use-vuln";
import type { TargetType, VulnScanner } from "@pentesthub/shared";

export function CreateVulnScanJobDialog({
  targetId,
  targetType,
  onCreated,
}: {
  targetId: string;
  targetType: TargetType;
  onCreated?: (jobId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [scanners, setScanners] = React.useState<VulnScanner[]>([]);
  const [priority, setPriority] = React.useState(0);
  const createJob = useCreateVulnScanJob(targetId);

  async function handleSubmit(): Promise<void> {
    try {
      const job = await createJob.mutateAsync({ scanners, priority });
      toast.success(t("vuln.create.started", { count: scanners.length }));
      setOpen(false);
      setScanners([]);
      setPriority(0);
      onCreated?.(job.id);
    } catch (error) {
      toast.error(scanErrorMessage(error, t("vuln.create.error")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <ShieldAlert className="size-4" /> {t("vuln.create.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("vuln.create.title")}</DialogTitle>
          <DialogDescription>{t("vuln.create.description")}</DialogDescription>
        </DialogHeader>

        <VulnScannerSelectList targetType={targetType} selected={scanners} onChange={setScanners} />

        <div className="flex items-center gap-3">
          <Label htmlFor="vuln-scan-priority" className="text-sm text-muted-foreground">
            {t("vuln.create.priority")}
          </Label>
          <Input
            id="vuln-scan-priority"
            type="number"
            min={0}
            max={100}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-24"
          />
        </div>

        <DialogFooter>
          <Button
            onClick={() => void handleSubmit()}
            disabled={scanners.length === 0 || createJob.isPending}
          >
            {createJob.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("vuln.create.submit", { count: scanners.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
