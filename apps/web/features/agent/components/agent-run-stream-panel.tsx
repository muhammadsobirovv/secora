"use client";

import * as React from "react";
import { Circle, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentRunStream } from "../hooks/use-agent";
import type { OrchestrationStreamEvent } from "@pentesthub/shared";

function describeEvent(event: OrchestrationStreamEvent): { text: string; tone: "default" | "error" } {
  switch (event.type) {
    case "plan":
      return { text: `Plan ready — ${event.plan.steps.length} step(s).`, tone: "default" };
    case "task_started":
      return { text: `Started: ${event.task.title} (${event.task.agentType})`, tone: "default" };
    case "task_progress":
      return { text: event.reasoningSummary, tone: "default" };
    case "task_tool_call":
      return { text: `Tool call: ${event.toolName}`, tone: "default" };
    case "task_tool_result":
      return { text: `Tool result: ${event.toolName}`, tone: "default" };
    case "task_completed":
      return { text: `Completed: ${event.task.title}`, tone: "default" };
    case "task_failed":
      return { text: `Failed: ${event.task.title} — ${event.task.errorMessage ?? "unknown error"}`, tone: "error" };
    case "run_completed":
      return { text: "Run completed.", tone: "default" };
    case "run_failed":
      return { text: `Run failed — ${event.message}`, tone: "error" };
    case "cancelled":
      return { text: "Run cancelled.", tone: "error" };
    default:
      return { text: "Unknown event", tone: "default" };
  }
}

/// Only connects the SSE stream while the run is actually non-terminal —
/// mirrors ReconLiveLogPanel's `enabled` gating exactly (caller passes
/// `!TERMINAL_STATUSES.includes(run.status)`).
export function AgentRunStreamPanel({ runId, enabled }: { runId: string; enabled: boolean }) {
  const { events, connected, error } = useAgentRunStream(runId, enabled);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events]);

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Terminal className="size-3.5" /> Live activity
        </div>
        {enabled && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Circle
              className={cn("size-2", connected ? "fill-success text-success" : "fill-muted text-muted")}
            />
            {connected ? "Streaming" : "Connecting…"}
          </div>
        )}
      </div>
      <div ref={scrollRef} className="max-h-80 overflow-y-auto px-3 py-2 font-mono text-xs">
        {error && <p className="text-destructive">{error}</p>}
        {events.length === 0 && !error && (
          <p className="text-muted-foreground">
            {enabled ? "Waiting for output…" : "No live output for a finished run."}
          </p>
        )}
        {events.map(({ id, event }) => {
          const { text, tone } = describeEvent(event);
          return (
            <div
              key={id}
              className={cn("whitespace-pre-wrap", tone === "error" ? "text-destructive" : "text-foreground")}
            >
              <span className="text-muted-foreground">[{event.type}]</span> {text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
