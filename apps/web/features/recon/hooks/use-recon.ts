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
export function useReconJobLogs(jobId: string, enabled: boolean): UseReconJobLogsResult {
  const [logs, setLogs] = React.useState<ReconJobLogDto[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !jobId) return;
    const controller = new AbortController();
    setLogs([]);
    setError(null);

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
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Log stream disconnected.");
      } finally {
        setConnected(false);
      }
    }

    void run();
    return () => controller.abort();
  }, [jobId, enabled]);

  return { logs, connected, error };
}
