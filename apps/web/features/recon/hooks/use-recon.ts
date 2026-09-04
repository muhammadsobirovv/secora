"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RECON_JOB_ENDPOINTS } from "@pentesthub/shared";
import type {
  CreateReconJobRequestDto,
  PromoteFindingRequestDto,
  ReconJobLogDto,
  ReconJobStatus,
} from "@pentesthub/shared";
import * as reconApi from "@/lib/api/recon";
import { API_BASE_URL } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth-store";

const TERMINAL_STATUSES: ReconJobStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];
/// A RUNNING/RETRYING job's status, tool-run progress, and findings count
/// all change server-side without any user action — short polling is the
/// simplest way to reflect that without a second live-update channel
/// beyond the log SSE stream this module already has.
const ACTIVE_JOB_POLL_MS = 3000;

export const reconKeys = {
  all: ["recon"] as const,
  jobsForTarget: (targetId: string) => ["recon", "jobs", "target", targetId] as const,
  jobsForProject: (projectId: string) => ["recon", "jobs", "project", projectId] as const,
  jobsRecent: ["recon", "jobs", "recent"] as const,
  job: (id: string) => ["recon", "jobs", "detail", id] as const,
  jobFindings: (jobId: string) => ["recon", "findings", "job", jobId] as const,
  targetFindings: (targetId: string) => ["recon", "findings", "target", targetId] as const,
};

export function useReconJobsForTarget(targetId: string) {
  return useQuery({
    queryKey: reconKeys.jobsForTarget(targetId),
    queryFn: () => reconApi.listReconJobsForTarget(targetId),
    enabled: Boolean(targetId),
  });
}

export function useReconJobsForProject(projectId: string) {
  return useQuery({
    queryKey: reconKeys.jobsForProject(projectId),
    queryFn: () => reconApi.listReconJobsForProject(projectId),
    enabled: Boolean(projectId),
  });
}

export function useRecentReconJobs() {
  return useQuery({
    queryKey: reconKeys.jobsRecent,
    queryFn: () => reconApi.listRecentReconJobs(),
    refetchInterval: ACTIVE_JOB_POLL_MS,
  });
}

export function useReconJob(id: string) {
  return useQuery({
    queryKey: reconKeys.job(id),
    queryFn: () => reconApi.getReconJob(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || TERMINAL_STATUSES.includes(status)) return false;
      return ACTIVE_JOB_POLL_MS;
    },
  });
}

export function useReconJobFindings(jobId: string, enabled = true) {
  return useQuery({
    queryKey: reconKeys.jobFindings(jobId),
    queryFn: () => reconApi.listReconJobFindings(jobId),
    enabled: Boolean(jobId) && enabled,
  });
}

export function useTargetReconFindings(targetId: string) {
  return useQuery({
    queryKey: reconKeys.targetFindings(targetId),
    queryFn: () => reconApi.listReconFindingsForTarget(targetId),
    enabled: Boolean(targetId),
  });
}

function useInvalidateRecon() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: reconKeys.all });
}

export function useCreateReconJob(targetId: string) {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: (data: CreateReconJobRequestDto) => reconApi.createReconJob(targetId, data),
    onSuccess: invalidate,
  });
}

export function useCancelReconJob() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: (id: string) => reconApi.cancelReconJob(id),
    onSuccess: invalidate,
  });
}

export function useRetryReconJob() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: (id: string) => reconApi.retryReconJob(id),
    onSuccess: invalidate,
  });
}

export function usePromoteReconFinding() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: PromoteFindingRequestDto }) =>
      reconApi.promoteReconFinding(id, data),
    onSuccess: invalidate,
  });
}

interface UseReconJobLogsResult {
  logs: ReconJobLogDto[];
  connected: boolean;
  error: string | null;
}

/// The live-log SSE endpoint requires the same Bearer JWT as every other
/// API call, which the browser's native EventSource can't attach (it
/// doesn't support custom headers) — so this reads the stream manually
/// via fetch()'s ReadableStream instead of using EventSource. Server-Sent
/// Events framing is "data: <payload>" lines terminated by a blank line;
/// NestJS's @Sse() decorator JSON-serializes each MessageEvent.data, so
/// each block's payload is parsed as a ReconJobLogDto.
///
/// Module 18 — task #525 (Phase 23: frontend reliability audit). Before
/// this change, a dropped connection (a network blip, or the exact
/// no-heartbeat-during-quiet-polling gap this project's own Module 18
/// Phase 15 disclosed on the backend side — see
/// recon-jobs.controller.ts's streamLogs() doc comment — being timed out
/// by an idle intermediary proxy) left `connected: false` and `error` set
/// permanently: nothing tried again, so a still-running job's log view
/// would silently stop updating until the user navigated away and back.
/// This adds a bounded exponential-backoff auto-reconnect (5 attempts,
/// 1s/2s/4s/8s/16s) around the same `run()` logic — safe to add here
/// because this stream's state is a simple append-only log array with no
/// mid-message resume semantics to get wrong (unlike the AI chat/agent
/// orchestration streams in use-ai.ts/use-agent.ts, which this same audit
/// found have the identical no-reconnect gap but were deliberately left
/// alone: a naive reconnect there risks duplicating or corrupting
/// in-progress streamed AI content in a way that can't be verified
/// without a running browser in this sandbox — tracked as a disclosed
/// follow-up in docs/operations/, not silently left undocumented).
const MAX_RECONNECT_ATTEMPTS = 5;

export function useReconJobLogs(jobId: string, enabled: boolean): UseReconJobLogsResult {
  const [logs, setLogs] = React.useState<ReconJobLogDto[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !jobId) return;
    const controller = new AbortController();
    setLogs([]);
    setError(null);
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function run(): Promise<void> {
      try {
        const accessToken = useAuthStore.getState().accessToken;
        const response = await fetch(`${API_BASE_URL}${RECON_JOB_ENDPOINTS.logsStream(jobId)}`, {
          headers: {
            Accept: "text/event-stream",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`Log stream failed with status ${response.status}`);
        }
        setConnected(true);
        setError(null);
        attempt = 0; // A successful connect resets the backoff counter.

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
              const entry = JSON.parse(dataLines.join("")) as ReconJobLogDto;
              setLogs((prev) => [...prev, entry]);
            } catch {
              // Non-JSON keep-alive / comment frame — ignore.
            }
          }
        }
        // The server closes the stream normally once the job reaches a
        // terminal state (see streamLogs()'s existing terminal-event
        // logic) — reaching here via `break` (not `catch`) is that
        // intentional, non-error close, so no reconnect is attempted.
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Log stream disconnected.";
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          attempt += 1;
          setError(`${message} — reconnecting (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})…`);
          const delayMs = 1000 * 2 ** (attempt - 1);
          retryTimer = setTimeout(() => void run(), delayMs);
          return;
        }
        setError(`${message} — gave up after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts.`);
      } finally {
        setConnected(false);
      }
    }

    void run();
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [jobId, enabled]);

  return { logs, connected, error };
}
