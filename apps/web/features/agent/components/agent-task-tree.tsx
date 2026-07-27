"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentTaskStatusBadge } from "./agent-run-status-badge";
import type { AgentTaskDto } from "@pentesthub/shared";

/// The task tree (AgentTaskDto.subTasks) is the visual record of Task
/// Delegation — the Master AI Orchestrator's plan.steps become tasks,
/// which can themselves delegate to sub-tasks (parentTaskId). Rendered
/// recursively with collapsible nodes since a deep run can have dozens
/// of tasks.
export function AgentTaskTree({ tasks }: { tasks: AgentTaskDto[] }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks yet — the orchestrator is still planning.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {tasks.map((task) => (
        <AgentTaskNode key={task.id} task={task} depth={0} />
      ))}
    </div>
  );
}

function AgentTaskNode({ task, depth }: { task: AgentTaskDto; depth: number }) {
  const [expanded, setExpanded] = React.useState(depth === 0);
  const hasDetail = task.toolCalls.length > 0 || task.reasoningSummary || task.subTasks.length > 0;

  return (
    <div className={cn(depth > 0 && "ml-5 border-l border-border pl-3")}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        disabled={!hasDetail}
        className="flex w-full items-start gap-2 rounded-md py-1 text-left hover:bg-muted/50 disabled:hover:bg-transparent"
      >
        {hasDetail ? (
          expanded ? (
            <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="mt-0.5 size-3.5 shrink-0" />
        )}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
            {task.agentType.replace(/_/g, " ")}
          </span>
          <span className="text-sm font-medium">{task.title}</span>
          <AgentTaskStatusBadge status={task.status} />
          {task.confidenceScore !== null && (
            <span className="text-xs text-muted-foreground">
              {Math.round(task.confidenceScore * 100)}% confidence
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="ml-5 flex flex-col gap-2 pb-2 pl-3">
          {task.reasoningSummary && (
            <p className="text-xs text-muted-foreground">{task.reasoningSummary}</p>
          )}
          {task.errorMessage && <p className="text-xs text-destructive">{task.errorMessage}</p>}
          {task.toolCalls.length > 0 && (
            <div className="flex flex-col gap-1">
              {task.toolCalls.map((call) => (
                <div key={call.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wrench className="size-3" />
                  <span className="font-mono">{call.toolName}</span>
                  {call.errorMessage && <span className="text-destructive">failed</span>}
                  {call.durationMs !== null && <span>{call.durationMs}ms</span>}
                </div>
              ))}
            </div>
          )}
          {task.subTasks.length > 0 && (
            <div className="flex flex-col gap-2">
              {task.subTasks.map((sub) => (
                <AgentTaskNode key={sub.id} task={sub} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
