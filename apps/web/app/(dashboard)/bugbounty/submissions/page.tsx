"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Send, Award } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useCreateSubmission, useSubmissions } from "@/features/bugbounty/hooks/use-submissions";
import type { SubmissionStatus } from "@pentesthub/shared";

const STATUS_VARIANTS: Record<SubmissionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SUBMITTED: "secondary",
  TRIAGED: "secondary",
  INFORMATIVE: "outline",
  DUPLICATE: "outline",
  NOT_APPLICABLE: "outline",
  ACCEPTED: "default",
  RESOLVED: "default",
  BOUNTY_PAID: "default",
  CLOSED: "outline",
  REOPENED: "secondary",
};

const PLATFORMS = ["HACKERONE", "BUGCROWD", "INTIGRITI", "YESWEHACK", "SYNACK", "INTERNAL", "PRIVATE", "CUSTOM"];
const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

/// Module 16 — task #385. `findingId` is entered manually here (a picker
/// wired to BugBountyFindingsController's list would be a natural
/// follow-up) — the important security property lives server-side in
/// CreateSubmissionHandler, not in this form: the backend re-derives
/// program/project/workspace from the finding itself and 404s if it
/// belongs to another workspace, regardless of what this form submits.
export default function SubmissionsPage() {
  const [statusFilter, setStatusFilter] = React.useState<string | undefined>(undefined);
  const { data: submissions, isLoading } = useSubmissions({ status: statusFilter });
  const createSubmission = useCreateSubmission();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    findingId: "",
    title: "",
    severity: "MEDIUM",
    platform: "HACKERONE",
    externalUrl: "",
    notes: "",
  });

  async function handleCreate() {
    try {
      await createSubmission.mutateAsync({
        findingId: form.findingId,
        title: form.title,
        severity: form.severity,
        platform: form.platform,
        externalUrl: form.externalUrl || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Submission created.");
      setOpen(false);
      setForm({ findingId: "", title: "", severity: "MEDIUM", platform: "HACKERONE", externalUrl: "", notes: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create submission.");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
          <p className="text-sm text-muted-foreground">
            Track findings submitted to bug bounty platforms and their outcomes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter ?? "ALL"} onValueChange={(v: string) => setStatusFilter(v === "ALL" ? undefined : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {Object.keys(STATUS_VARIANTS).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New submission
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New submission</DialogTitle>
                <DialogDescription>
                  Submit an existing bug bounty finding to a platform for review.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="findingId">Finding ID</Label>
                  <Input
                    id="findingId"
                    value={form.findingId}
                    onChange={(e) => setForm((f) => ({ ...f, findingId: e.target.value }))}
                    placeholder="Finding UUID"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Severity</Label>
                    <Select value={form.severity} onValueChange={(v: string) => setForm((f) => ({ ...f, severity: v }))}>
                      <SelectTrigger>
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
                  <div className="space-y-1">
                    <Label>Platform</Label>
                    <Select value={form.platform} onValueChange={(v: string) => setForm((f) => ({ ...f, platform: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLATFORMS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="externalUrl">External URL (optional)</Label>
                  <Input
                    id="externalUrl"
                    value={form.externalUrl}
                    onChange={(e) => setForm((f) => ({ ...f, externalUrl: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreate}
                  disabled={!form.findingId || !form.title || createSubmission.isPending}
                >
                  <Send className="mr-2 h-4 w-4" /> Submit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !submissions?.length ? (
            <EmptyState icon={Award} title="No submissions yet" description="Submit a finding to a bug bounty platform to see it here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reward</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/bugbounty/submissions/${s.id}`} className="font-medium hover:underline">
                        {s.title}
                      </Link>
                    </TableCell>
                    <TableCell>{s.platform}</TableCell>
                    <TableCell>{s.severity}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[s.status] ?? "outline"}>{s.status}</Badge>
                    </TableCell>
                    <TableCell>{s.reward ? `${s.reward} ${s.currency ?? ""}` : "—"}</TableCell>
                    <TableCell>{s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
