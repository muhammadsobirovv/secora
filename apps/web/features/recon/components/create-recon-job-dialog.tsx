"use client";

import * as React from "react";
import { Loader2, Radar } from "lucide-react";
import { toast } from "sonner";
import { scanErrorMessage } from "@/features/targets/scan-error-message";
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
  const [open, setOpen] = React.useState(false);
  const [tools, setTools] = React.useState<ReconTool[]>([]);
  const createJob = useCreateReconJob(targetId);

  async function handleSubmit(): Promise<void> {
    try {
      const job = await createJob.mutateAsync({ tools });
      toast.success(`Recon job started (${tools.length} tool${tools.length === 1 ? "" : "s"})`);
      setOpen(false);
      setTools([]);
      onCreated?.(job.id);
    } catch (error) {
      toast.error(scanErrorMessage(error, "Couldn't start the recon job. Please try again."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Radar className="size-4" /> New scan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Start a recon scan</DialogTitle>
          <DialogDescription>
            Choose which tools to run against this target. Every scan runs asynchronously — you can
            close this dialog and track progress from the job list.
          </DialogDescription>
        </DialogHeader>

        <ReconToolSelectList targetType={targetType} selected={tools} onChange={setTools} />

        <DialogFooter>
          <Button
            onClick={() => void handleSubmit()}
            disabled={tools.length === 0 || createJob.isPending}
          >
            {createJob.isPending && <Loader2 className="size-4 animate-spin" />}
            Start scan ({tools.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
