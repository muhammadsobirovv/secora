"use client";

import * as React from "react";
import { Loader2, Radar } from "lucide-react";
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
import { ReconToolSelectList } from "./recon-tool-select-list";
import { useCreateReconJob } from "../hooks/use-recon";
import type { ReconTool, TargetType } from "@pentesthub/shared";

export function CreateReconJobDialog({
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
  const [tools, setTools] = React.useState<ReconTool[]>([]);
  const createJob = useCreateReconJob(targetId);

  async function handleSubmit(): Promise<void> {
    try {
      const job = await createJob.mutateAsync({ tools });
      toast.success(t("recon.create.started", { count: tools.length }));
      setOpen(false);
      setTools([]);
      onCreated?.(job.id);
    } catch (error) {
      toast.error(scanErrorMessage(error, t("recon.create.error"), t));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Radar className="size-4" /> {t("recon.create.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("recon.create.title")}</DialogTitle>
          <DialogDescription>{t("recon.create.description")}</DialogDescription>
        </DialogHeader>

        <ReconToolSelectList targetType={targetType} selected={tools} onChange={setTools} />

        <DialogFooter>
          <Button
            onClick={() => void handleSubmit()}
            disabled={tools.length === 0 || createJob.isPending}
          >
            {createJob.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("recon.create.submit", { count: tools.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
