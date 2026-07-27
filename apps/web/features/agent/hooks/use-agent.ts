"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AGENT_ORCHESTRATION_ENDPOINTS } from "@pentesthub/shared";
import type {
  CreateOrchestrationRunRequestDto,
  ListOrchestrationRunsQueryDto,
  OrchestrationRunStatus,
  OrchestrationStreamEvent,
} from "@pentesthub/shared";
import * as agentApi from "@/lib/api/agent";
import { API_BASE_URL } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth-store";

const TERMINAL_STATUSES: OrchestrationRunStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];
/// A RUNNING/PLANNING run's status and task tree change server-side
/// without user action — same short-polling rationale as useReconJob,
/// alongside (not instead of) the SSE stream below, which is the live
/// "what's happening right now" activity feed.
const ACTIVE_RUN_POLL_MS = 3000;

export const agentKeys = {
  all: ["agent", "runs"] as const,
  list: (query: ListOrchestrationRunsQueryDto) => ["agent", "runs", "list", query] as const,
  run: (id: string) => ["agent", "runs", "detail", id] as const,
  explanation: (id: string) => ["agent", "runs", "explanation", id] as const,
};

export function useOrchestrationRuns(query: ListOrchestrationRunsQueryDto = {}) {
  return useQuery({
    queryKey: agentKeys.list(query),
    queryFn: () => agentApi.listOrchestrationRuns(query),
    refetchInterval: ACTIVE_RUN_POLL_MS,
  });
}

export function useOrchestrationRun(id: string) {
  return useQuery({
    queryKey: agentKeys.run(id),
    queryFn: () => agentApi.getOrchestrationRun(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || TERMINAL_STATUSES.includes(status)) return false;
      return ACTIVE_RUN_POLL_MS;
    },
  });
}

export function useOrchestrationRunExplanation(id: string, enabled = true) {
  return useQuery({
    queryKey: agentKeys.explanation(id),
    queryFn: () => agentApi.explainOrchestrationRun(id),
    enabled: Boolean(id) && enabled,
  });
}

function useInvalidateAgent() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: agentKeys.all });
}

export function useStartOrchestrationRun() {
  const invalidate = useInvalidateAgent();
  return useMutation({
    mutationFn: (data: CreateOrchestrationRunRequestDto) => agentApi.createOrchestrationRun(data),
    onSuccess: invalidate,
  });
}

export function useCancelOrchestrationRun() {
  const invalidate = useInvalidateAgent();
  return useMutation({
    mutationFn: (id: string) => agentApi.cancelOrchestrationRun(id),
    onSuccess: invalidate,
  });
}

export function useRetryOrchestrationRun() {
  const invalidate = useInvalidateAgent();
  return useMutation({
    mutationFn: (id: string) => agentApi.retryOrchestrationRun(id),
    onSuccess: invalidate,
  });
}

interface AgentStreamEntry {
  id: string;
  event: OrchestrationStreamEvent;
}

interface UseAgentRunStreamResult {
  events: AgentStreamEntry[];
  connected: boolean;
  error: string | null;
}

/// Live "what's the orchestrator doing right now" activity feed. Same
/// manual-fetch/ReadableStream approach as useReconJobLogs — the
/// @Sse() endpoint needs the same Bearer JWT every other API call uses,
/// which native EventSource can't attach. Callers should still rely on
/// useOrchestrationRun's poll for the authoritative task tree; this hook
/// is for surfacing progress/tool-call events as they happen, not for
/// reconstructing run state client-side.
export function useAgentRunStream(runId: string, enabled: boolean): UseAgentRunStreamResult {
  const [events, setEvents] = React.useState<AgentStreamEntry[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!enabled || !runId) return;
    const controller = new AbortController();
    setEvents([]);
    setError(null);
    let seq = 0;

    async function run(): Promise<void> {
      try {
        const accessToken = useAuthStore.getState().accessToken;
        const response = await fetch(`${API_BASE_URL}${AGENT_ORCHESTRATION_ENDPOINTS.stream(runId)}`, {
          headers: {
            Accept: "text/event-stream",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`Run stream failed with status ${response.status}`);
        }
        setConnected(true);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const dataLines = block
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim());
            if (dataLines.length === 0) continue;
            try {
              const parsed = JSON.parse(dataLines.join("")) as OrchestrationStreamEvent;
              seq += 1;
              setEvents((prev) => [...prev, { id: `${runId}-${seq}`, event: parsed }]);
              // Task/run lifecycle events mean the authoritative task tree
              // (GetOrchestrationRun) is stale — refetch it immediately
              // instead of waiting for the next poll tick.
              if (parsed.type !== "task_progress" && parsed.type !== "plan") {
                void queryClient.invalidateQueries({ queryKey: agentKeys.run(runId) });
              }
            } catch {
              // Non-JSON keep-alive / comment frame — ignore.
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Run stream disconnected.");
      } finally {
        setConnected(false);
      }
    }

    void run();
    return () => controller.abort();
  }, [runId, enabled, queryClient]);

  return { events, connected, error };
}
