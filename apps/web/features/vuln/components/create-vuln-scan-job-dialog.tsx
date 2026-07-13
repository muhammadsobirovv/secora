"use client";

import * as React from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
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
  const [open, setOpen] = React.useState(false);
  const [scanners, setScanners] = React.useState<VulnScanner[]>([]);
  const [priority, setPriority] = React.useState(0);
  const createJob = useCreateVulnScanJob(targetId);

  async function handleSubmit(): Promise<void> {
    try {
      const job = await createJob.mutateAsync({ scanners, priority });
      toast.success(`Vulnerability scan started (${scanners.length} scanner${scanners.length === 1 ? "" : "s"})`);
      setOpen(false);
      setScanners([]);
      setPriority(0);
      onCreated?.(job.id);
    } catch {
      toast.error("Couldn't start the scan. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <ShieldAlert className="size-4" /> New scan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Start a vulnerability scan</DialogTitle>
          <DialogDescription>
            Choose which scanners to run against this target. Every scan runs asynchronously — you
            can close this dialog and track progress from the job list.
          </DialogDescription>
        </DialogHeader>

        <VulnScannerSelectList targetType={targetType} selected={scanners} onChange={setScanners} />

        <div className="flex items-center gap-3">
          <Label htmlFor="vuln-scan-priority" className="text-sm text-muted-foreground">
            Priority (0–100, higher runs first)
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
            Start scan ({scanners.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
