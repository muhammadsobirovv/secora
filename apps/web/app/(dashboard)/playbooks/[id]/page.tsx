"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Workflow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import {
  useArchivePlaybook,
  usePlaybook,
  usePlaybookExecutions,
  usePublishPlaybook,
  useDryRunPlaybook,
  useRunPlaybook,
  useValidatePlaybook,
} from "@/features/playbooks/hooks/use-playbooks";
import type { PlaybookDryRunResultDto, PlaybookValidationResultDto } from "@pentesthub/shared";

export default function PlaybookDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, isLoading } = usePlaybook(id);
  const publishPlaybook = usePublishPlaybook();
  const archivePlaybook = useArchivePlaybook();
  const validatePlaybook = useValidatePlaybook();
  const dryRunPlaybook = useDryRunPlaybook(id);
  const runPlaybook = useRunPlaybook(id);
  const { data: executions } = usePlaybookExecutions(id);

  const [targetId, setTargetId] = React.useState("");
  const [validation, setValidation] = React.useState<PlaybookValidationResultDto | null>(null);
  const [dryRunResult, setDryRunResult] = React.useState<PlaybookDryRunResultDto | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6">
        <EmptyState icon={Workflow} title="Playbook not found" description="It may have been archived or belong to another workspace." />
      </div>
    );
  }

  const { playbook, version } = data;

  async function handleValidate() {
    try {
      const result = await validatePlaybook.mutateAsync(id);
      setValidation(result);
      toast[result.valid ? "success" : "error"](result.valid ? "Graph is valid." : "Graph has validation errors.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Validation failed.");
    }
  }

  async function handlePublish() {
    try {
      await publishPlaybook.mutateAsync(id);
      toast.success("Playbook published.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish playbook.");
    }
  }

  async function handleArchive() {
    try {
      await archivePlaybook.mutateAsync(id);
      toast.success("Playbook archived.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive playbook.");
    }
  }

  async function handleDryRun() {
    if (!targetId) return;
    try {
      const result = await dryRunPlaybook.mutateAsync({ targetId, isDryRun: true });
      setDryRunResult(result);
      toast.success("Dry run complete — no tools were executed, no findings modified, no notifications sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dry run failed.");
    }
  }

  async function handleRun() {
    if (!targetId) return;
    try {
      await runPlaybook.mutateAsync({ targetId });
      toast.success("Playbook execution started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start execution.");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{playbook.name}</h1>
          <p className="text-sm text-muted-foreground">{playbook.description ?? "No description."}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={playbook.status === "PUBLISHED" ? "default" : "outline"}>{playbook.status}</Badge>
          <Button variant="outline" onClick={handleValidate} disabled={validatePlaybook.isPending}>
            Validate
          </Button>
          {playbook.status !== 'ARCHIVED' && (
            <Button onClick={handlePublish} disabled={publishPlaybook.isPending}>
              Publish
            </Button>
          )}
          {playbook.status !== 'ARCHIVED' && (
            <Button variant="destructive" onClick={handleArchive} disabled={archivePlaybook.isPending}>
              Archive
            </Button>
          )}
        </div>
      </div>

      {validation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validation result — {validation.valid ? "valid" : "invalid"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {validation.issues.length === 0 ? (
              <p className="text-muted-foreground">No issues.</p>
            ) : (
              validation.issues.map((issue, i) => (
                <p key={i} className={issue.severity === "ERROR" ? "text-destructive" : "text-muted-foreground"}>
                  [{issue.severity}] {issue.code}: {issue.message}
                </p>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step graph (version {version?.version ?? "—"})</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs">
            {version ? JSON.stringify(version.graph, null, 2) : "No version yet."}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run against a target</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="targetId">Target ID</Label>
              <Input id="targetId" value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="Target UUID" />
            </div>
            <Button variant="outline" onClick={handleDryRun} disabled={!targetId || dryRunPlaybook.isPending}>
              Dry run
            </Button>
            <Button onClick={handleRun} disabled={!targetId || playbook.status !== "PUBLISHED" || runPlaybook.isPending}>
              Run
            </Button>
          </div>
          {playbook.status !== "PUBLISHED" && (
            <p className="text-xs text-muted-foreground">Publish this playbook before running it for real (dry-run works on any draft's latest version).</p>
          )}
          {dryRunResult && (
            <div className="space-y-2 rounded border p-3 text-sm">
              <p className="font-medium">
                Dry run — target scope: {dryRunResult.targetScopeStatus}, estimated {dryRunResult.estimatedDurationSeconds}s
              </p>
              {dryRunResult.plannedSteps.map((step) => (
                <div key={step.nodeId} className="flex items-center justify-between border-b py-1 last:border-0">
                  <span>
                    {step.label} <span className="text-muted-foreground">({step.type})</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {step.toolsInvolved.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                    {step.requiresApproval && <Badge variant="outline">requires approval</Badge>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Executions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!executions?.length ? (
            <p className="text-sm text-muted-foreground">No executions yet.</p>
          ) : (
            executions.map((execution) => (
              <div key={execution.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
                <span className="font-mono text-xs">{execution.id}</span>
                <Badge
                  variant={
                    execution.status === "COMPLETED"
                      ? "default"
                      : execution.status === "FAILED"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {execution.status}
                </Badge>
                <span className="text-muted-foreground">{execution.steps.length} steps</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
