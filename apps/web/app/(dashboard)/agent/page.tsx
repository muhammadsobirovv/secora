"use client";

import { Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrchestrationRuns } from "@/features/agent/hooks/use-agent";
import { AgentRunList } from "@/features/agent/components/agent-run-list";
import { StartOrchestrationRunForm } from "@/features/agent/components/start-orchestration-run-form";

/// Module 11 — AI Security Copilot + Autonomous Multi-Agent System
/// landing page. Mirrors the recon landing page's "recent activity,
/// workspace-wide" shape — a run isn't picked-project-first, since the
/// Master AI Orchestrator can be pointed at a goal without one.
export default function AgentLandingPage() {
  const { data: runs, isLoading } = useOrchestrationRuns({ limit: 25 });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Bot className="size-6" /> Agent Copilot
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Give the Master AI Orchestrator a goal — it plans, delegates to specialist agents, and reports back.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start a new run</CardTitle>
        </CardHeader>
        <CardContent>
          <StartOrchestrationRunForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentRunList runs={runs} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
