"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bug, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  useBugBountyFindings,
  useBugBountyPrograms,
  useCreateBugBountyFinding,
} from "@/features/bugbounty/hooks/use-bugbounty";
import { BugBountyFindingStageBadge } from "@/features/bugbounty/components/bugbounty-badges";
import { VulnFindingSeverityBadge } from "@/features/vuln/components/vuln-finding-severity-badge";
import type { VulnFindingSeverity } from "@pentesthub/shared";

const SEVERITIES: VulnFindingSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

function CreateFindingDialog({ defaultProgramId }: { defaultProgramId?: string }) {
  const [open, setOpen] = React.useState(false);
  const [programId, setProgramId] = React.useState(defaultProgramId ?? "");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [severity, setSeverity] = React.useState<VulnFindingSeverity>("MEDIUM");
  const { data: programs } = useBugBountyPrograms();
  const createFinding = useCreateBugBountyFinding();

  async function handleSubmit(): Promise<void> {
    try {
      await createFinding.mutateAsync({ programId, title, description, severity });
      toast.success("Finding created");
      setOpen(false);
      setTitle("");
      setDescription("");
    } catch {
      toast.error("Couldn't create this finding.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New finding
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New finding</DialogTitle>
          <DialogDescription>Track a vulnerability you plan to report.</DialogDescription>
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
            <Label htmlFor="finding-title">Title</Label>
            <Input id="finding-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="finding-desc">Description</Label>
            <Textarea
              id="finding-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              rows={4}
            />
          </div>
          <div>
            <Label>Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as VulnFindingSeverity)}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!programId || !title || !description || createFinding.isPending}
          >
            {createFinding.isPending && <Loader2 className="size-4 animate-spin" />}
            Create finding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BugBountyFindingsContent() {
  const searchParams = useSearchParams();
  const programId = searchParams.get("programId") ?? undefined;
  const [search, setSearch] = React.useState("");
  const { data: findings, isLoading } = useBugBountyFindings({ programId, search: search || undefined });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bug className="size-6" /> Findings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Track vulnerabilities through triage to report.</p>
        </div>
        <CreateFindingDialog defaultProgramId={programId} />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Search findings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !findings?.length ? (
        <EmptyState icon={Bug} title="No findings" description="Create a finding to start tracking it." />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {findings.map((finding) => (
              <Link
                key={finding.id}
                href={`/bugbounty/findings/${finding.id}`}
                className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{finding.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{finding.endpoint ?? finding.vulnType ?? "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <VulnFindingSeverityBadge severity={finding.severity} />
                  <BugBountyFindingStageBadge stage={finding.stage} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BugBountyFindingsPage() {
  return (
    <Suspense>
      <BugBountyFindingsContent />
    </Suspense>
  );
}
