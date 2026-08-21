"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGenerateSecurityReport } from "../hooks/use-security-reports";
import type { SecurityReportType } from "@pentesthub/shared";

const REPORT_TYPES: SecurityReportType[] = ["INCIDENT_SUMMARY", "THREAT_INTEL_SUMMARY", "POSTURE_SUMMARY"];

const TYPE_LABEL: Record<SecurityReportType, string> = {
  INCIDENT_SUMMARY: "Incident Summary",
  THREAT_INTEL_SUMMARY: "Threat Intel Summary",
  POSTURE_SUMMARY: "Posture Summary",
};

/// A generated report is a point-in-time JSON snapshot, not a live view
/// — see `SecurityReportingService.generate`'s own doc comment. Re-run
/// this dialog to refresh figures rather than expecting an existing
/// report to update itself.
export function GenerateReportDialog() {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<SecurityReportType>("POSTURE_SUMMARY");
  const [title, setTitle] = React.useState("");
  const [windowDays, setWindowDays] = React.useState("30");
  const generate = useGenerateSecurityReport();

  async function handleSubmit(): Promise<void> {
    try {
      await generate.mutateAsync({
        type,
        title: title || undefined,
        windowDays: windowDays ? Number(windowDays) : undefined,
      });
      toast.success("Report generated");
      setOpen(false);
      setTitle("");
    } catch {
      toast.error("Couldn't generate this report.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Generate report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate security report</DialogTitle>
          <DialogDescription>
            Composes a point-in-time snapshot from current incidents, threat intel, and security metrics.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label>Report type</Label>
            <Select value={type} onValueChange={(v) => setType(v as SecurityReportType)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="report-title">Title (optional)</Label>
            <Input id="report-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="report-window">Window (days)</Label>
            <Input
              id="report-window"
              type="number"
              min={1}
              max={365}
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={generate.isPending}>
            {generate.isPending && <Loader2 className="size-4 animate-spin" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
