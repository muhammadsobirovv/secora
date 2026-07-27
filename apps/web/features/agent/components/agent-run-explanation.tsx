import { Sparkles } from "lucide-react";
import { AgentTaskStatusBadge } from "./agent-run-status-badge";
import type { AgentTaskExplanationDto, OrchestrationExplanationDto } from "@pentesthub/shared";

/// Renders AgentExplainabilityService's "why did the system conclude
/// this" narrative (task #233) — the Reasoning Engine's plan reasoning,
/// alternatives considered, and each task's evidence/sources, reshaped
/// top-to-bottom the way a human reviewer would want to read it.
export function AgentRunExplanation({ explanation }: { explanation: OrchestrationExplanationDto }) {
  return (
    <div className="flex flex-col gap-4">
      {explanation.planReasoning && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Planning reasoning</h3>
          <p className="text-sm text-muted-foreground">{explanation.planReasoning}</p>
        </div>
      )}

      {explanation.alternativesConsidered.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Alternatives considered</h3>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {explanation.alternativesConsidered.map((alt, i) => (
              <li key={i}>{alt}</li>
            ))}
          </ul>
        </div>
      )}

      {explanation.overallConfidence !== null && (
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-muted-foreground" />
          <span className="font-medium">{Math.round(explanation.overallConfidence * 100)}%</span>
          <span className="text-muted-foreground">overall confidence</span>
        </div>
      )}

      {explanation.resultSummary && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Result summary</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{explanation.resultSummary}</p>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Task-by-task reasoning</h3>
        <div className="flex flex-col gap-3">
          {explanation.taskExplanations.map((task) => (
            <TaskExplanationNode key={task.taskId} task={task} depth={0} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskExplanationNode({ task, depth }: { task: AgentTaskExplanationDto; depth: number }) {
  return (
    <div className={depth > 0 ? "ml-4 border-l border-border pl-3" : "rounded-md border border-border p-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          {task.agentType.replace(/_/g, " ")}
        </span>
        <span className="text-sm font-medium">{task.title}</span>
        <AgentTaskStatusBadge status={task.status} />
        {task.confidenceScore !== null && (
          <span className="text-xs text-muted-foreground">{Math.round(task.confidenceScore * 100)}%</span>
        )}
      </div>
      {task.reasoningSummary && <p className="mt-1 text-xs text-muted-foreground">{task.reasoningSummary}</p>}
      {task.sources.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Sources: {task.sources.map((s) => s.label).join(", ")}
        </p>
      )}
      {task.evidence.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
          {task.evidence.map((ev, i) => (
            <li key={i}>
              <span className="font-mono">{ev.toolName}</span>: {ev.summary}
            </li>
          ))}
        </ul>
      )}
      {task.subTasks.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {task.subTasks.map((sub) => (
            <TaskExplanationNode key={sub.taskId} task={sub} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
