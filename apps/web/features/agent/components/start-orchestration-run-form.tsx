"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStartOrchestrationRun } from "../hooks/use-agent";

/// The Master AI Orchestrator's entry point — a free-text goal (e.g. "Do a
/// full recon + vuln triage pass on api.example.com and draft a summary
/// report") that the Reasoning Engine decomposes into a task tree on the
/// backend (see AgentOrchestratorService.startRun's Planning step).
export function StartOrchestrationRunForm({ projectId }: { projectId?: string }) {
  const [goal, setGoal] = React.useState("");
  const startRun = useStartOrchestrationRun();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!goal.trim()) return;
    try {
      const run = await startRun.mutateAsync({ goal: goal.trim(), projectId });
      setGoal("");
      toast.success("Orchestration run started");
      router.push(`/agent/runs/${run.id}`);
    } catch {
      toast.error("Couldn't start this run.");
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
      <Textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Describe a goal for the Copilot to work on, e.g. &quot;Recon this target and draft a findings summary.&quot;"
        rows={3}
        disabled={startRun.isPending}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={startRun.isPending || !goal.trim()}>
          {startRun.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Start run
        </Button>
      </div>
    </form>
  );
}
