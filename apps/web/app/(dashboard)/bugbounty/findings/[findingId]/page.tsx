"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bug, FileText, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import {
  useBugBountyFinding,
  useCheckDuplicateFinding,
  useCreateBugReport,
  useDeleteBugBountyFinding,
  useTransitionBugBountyFindingStage,
} from "@/features/bugbounty/hooks/use-bugbounty";
import { BugBountyFindingStageBadge } from "@/features/bugbounty/components/bugbounty-badges";
import { VulnFindingSeverityBadge } from "@/features/vuln/components/vuln-finding-severity-badge";
import type { BugBountyFindingStage } from "@pentesthub/shared";
import { BUGBOUNTY_FINDING_STAGE_ORDER } from "@pentesthub/shared";

const ALL_STAGES: BugBountyFindingStage[] = [...BUGBOUNTY_FINDING_STAGE_ORDER, "DUPLICATE", "NEED_MORE_INFO"];

export default function BugBountyFindingDetailPage() {
  const params = useParams<{ findingId: string }>();
  const router = useRouter();
  const findingId = params.findingId;
  const { data: finding, isLoading } = useBugBountyFinding(findingId);
  const transitionStage = useTransitionBugBountyFindingStage(findingId);
  const deleteFinding = useDeleteBugBountyFinding();
  const createReport = useCreateBugReport();
  const checkDuplicate = useCheckDuplicateFinding();
  const [nextStage, setNextStage] = React.useState<BugBountyFindingStage | "">("");

  async function handleTransition(): Promise<void> {
    if (!nextStage) return;
    try {
      await transitionStage.mutateAsync({ stage: nextStage });
      toast.success(`Moved to ${nextStage}`);
      setNextStage("");
    } catch {
      toast.error("Couldn't transition this finding — check the allowed transition table.");
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm("Delete this finding?")) return;
    try {
      await deleteFinding.mutateAsync(findingId);
      toast.success("Finding deleted");
      router.push("/bugbounty/findings");
    } catch {
      toast.error("Couldn't delete this finding.");
    }
  }

  async function handleCreateReport(): Promise<void> {
    if (!finding) return;
    try {
      const report = await createReport.mutateAsync({
        programId: finding.programId,
        findingId: finding.id,
        title: finding.title,
        summary: finding.description,
        cwe: finding.cwe ?? undefined,
        cvssScore: finding.cvssScore ?? undefined,
        cvssVector: finding.cvssVector ?? undefined,
      });
      toast.success("Draft report created");
      router.push(`/bugbounty/reports/${report.id}`);
    } catch {
      toast.error("Couldn't create a report from this finding.");
    }
  }

  async function handleCheckDuplicate(): Promise<void> {
    if (!finding) return;
    try {
      await checkDuplicate.mutateAsync({
        title: finding.title,
        endpoint: finding.endpoint ?? undefined,
        vulnType: finding.vulnType ?? undefined,
        programId: finding.programId,
        excludeFindingId: finding.id,
      });
    } catch {
      toast.error("Duplicate check failed.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!finding) {
    return <EmptyState icon={Bug} title="Finding not found" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/bugbounty/findings" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to findings
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{finding.title}</h1>
            <VulnFindingSeverityBadge severity={finding.severity} />
            <BugBountyFindingStageBadge stage={finding.stage} />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void handleCheckDuplicate()} disabled={checkDuplicate.isPending}>
              {checkDuplicate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Check duplicates
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleCreateReport()} disabled={createReport.isPending}>
              <FileText className="size-4" /> Create report
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void handleDelete()}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{finding.description}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
            {finding.endpoint && <span>Endpoint: {finding.endpoint}</span>}
            {finding.vulnType && <span>Type: {finding.vulnType}</span>}
            {finding.cwe && <span>CWE: {finding.cwe}</span>}
            {finding.cvssScore != null && <span>CVSS: {finding.cvssScore}</span>}
          </div>
          {finding.payload && (
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-2 text-xs">{finding.payload}</pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transition stage</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Select value={nextStage} onValueChange={(v) => setNextStage(v as BugBountyFindingStage)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select stage" />
            </SelectTrigger>
            <SelectContent>
              {ALL_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => void handleTransition()} disabled={!nextStage || transitionStage.isPending}>
            {transitionStage.isPending && <Loader2 className="size-4 animate-spin" />}
            Apply
          </Button>
        </CardContent>
      </Card>

      {checkDuplicate.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Duplicate matches</CardTitle>
          </CardHeader>
          <CardContent>
            {!checkDuplicate.data.matches.length ? (
              <p className="text-sm text-muted-foreground">No similar findings found.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {checkDuplicate.data.matches.map((m) => (
                  <Link
                    key={m.findingId}
                    href={`/bugbounty/findings/${m.findingId}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="truncate">{m.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {Math.round(m.similarityScore * 100)}% match
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
