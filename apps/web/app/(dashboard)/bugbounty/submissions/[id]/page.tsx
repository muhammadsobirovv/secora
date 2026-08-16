"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useSubmission, useUpdateSubmissionStatus } from "@/features/bugbounty/hooks/use-submissions";
import type { SubmissionStatus } from "@pentesthub/shared";

const SUBMISSION_STATUSES: SubmissionStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "TRIAGED",
  "INFORMATIVE",
  "DUPLICATE",
  "NOT_APPLICABLE",
  "ACCEPTED",
  "RESOLVED",
  "BOUNTY_PAID",
  "CLOSED",
  "REOPENED",
];

export default function SubmissionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: submission, isLoading } = useSubmission(id);
  const updateStatus = useUpdateSubmissionStatus(id);

  const [nextStatus, setNextStatus] = React.useState<SubmissionStatus | undefined>(undefined);
  const [reward, setReward] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");

  React.useEffect(() => {
    if (submission) {
      setNextStatus(submission.status);
      setReward(submission.reward != null ? String(submission.reward) : "");
      setCurrency(submission.currency ?? "USD");
    }
  }, [submission]);

  async function handleUpdate() {
    if (!nextStatus) return;
    try {
      await updateStatus.mutateAsync({
        status: nextStatus,
        reward: reward ? Number(reward) : undefined,
        currency: reward ? currency : undefined,
      });
      toast.success("Submission updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update submission.");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!submission) {
    return <div className="p-6 text-sm text-muted-foreground">Submission not found.</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{submission.title}</h1>
          <p className="text-sm text-muted-foreground">
            {submission.platform} · {submission.severity}
          </p>
        </div>
        <Badge>{submission.status}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Finding ID" value={submission.findingId} />
            <Row label="Program ID" value={submission.programId} />
            <Row label="External ID" value={submission.externalId ?? "—"} />
            <Row
              label="External URL"
              value={
                submission.externalUrl ? (
                  <a href={submission.externalUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {submission.externalUrl}
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <Row label="Submitted" value={submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : "—"} />
            <Row label="Last response" value={submission.responseAt ? new Date(submission.responseAt).toLocaleString() : "—"} />
            <Row label="Reward" value={submission.reward ? `${submission.reward} ${submission.currency ?? ""}` : "—"} />
            {submission.notes ? <Row label="Notes" value={submission.notes} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Update status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={nextStatus} onValueChange={(v: string) => setNextStatus(v as SubmissionStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBMISSION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="reward">Reward</Label>
                <Input id="reward" type="number" min={0} value={reward} onChange={(e) => setReward(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Setting a reward on ACCEPTED / RESOLVED / BOUNTY_PAID records an entry in the reward
              ledger, visible on the Rewards page.
            </p>
            <Button onClick={handleUpdate} disabled={updateStatus.isPending}>
              Save
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
