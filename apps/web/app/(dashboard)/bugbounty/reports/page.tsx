"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useBugBountyPrograms, useBugReports, useCreateBugReport } from "@/features/bugbounty/hooks/use-bugbounty";
import { BugReportStatusBadge } from "@/features/bugbounty/components/bugbounty-badges";

function CreateReportDialog({ defaultProgramId }: { defaultProgramId?: string }) {
  const [open, setOpen] = React.useState(false);
  const [programId, setProgramId] = React.useState(defaultProgramId ?? "");
  const [title, setTitle] = React.useState("");
  const { data: programs } = useBugBountyPrograms();
  const createReport = useCreateBugReport();

  async function handleSubmit(): Promise<void> {
    try {
      await createReport.mutateAsync({ programId, title });
      toast.success("Draft report created");
      setOpen(false);
      setTitle("");
    } catch {
      toast.error("Couldn't create this report.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New bug report</DialogTitle>
          <DialogDescription>Starts as a draft — use the Report Draft Assistant to fill it in.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Program</Label>
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Select a program" />
              </SelectTrigger>
              <SelectContent>
                {programs?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="report-title">Title</Label>
            <Input id="report-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={!programId || !title || createReport.isPending}>
            {createReport.isPending && <Loader2 className="size-4 animate-spin" />}
            Create report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BugReportsContent() {
  const searchParams = useSearchParams();
  const programId = searchParams.get("programId") ?? undefined;
  const { data: reports, isLoading } = useBugReports({ programId });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileText className="size-6" /> Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Draft, submit, and track bug bounty reports.</p>
        </div>
        <CreateReportDialog defaultProgramId={programId} />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !reports?.length ? (
        <EmptyState icon={FileText} title="No reports yet" description="Create a report to start drafting." />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {reports.map((report) => (
              <Link
                key={report.id}
                href={`/bugbounty/reports/${report.id}`}
                className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{report.title}</p>
                  <p className="text-xs text-muted-foreground">{report.template}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {report.bountyAmount != null && (
                    <span className="text-xs text-muted-foreground">
                      {report.bountyAmount} {report.currency}
                    </span>
                  )}
                  <BugReportStatusBadge status={report.status} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BugReportsPage() {
  return (
    <Suspense>
      <BugReportsContent />
    </Suspense>
  );
}
