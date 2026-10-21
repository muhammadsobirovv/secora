"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VULN_SCAN_JOB_ENDPOINTS } from "@pentesthub/shared";
import type {
  BulkUpdateVulnFindingsRequestDto,
  CreateVulnScanJobRequestDto,
  CreateVulnScanTemplateRequestDto,
  ListVulnFindingsQueryDto,
  ListVulnScanJobsQueryDto,
  UpdateVulnFindingStatusRequestDto,
  VulnScanJobLogDto,
  VulnScanJobStatus,
} from "@pentesthub/shared";
import * as vulnApi from "@/lib/api/vuln";
import { API_BASE_URL } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth-store";

const TERMINAL_STATUSES: VulnScanJobStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];
/// Same reasoning as Recon's ACTIVE_JOB_POLL_MS — a RUNNING/PAUSED/RETRYING
/// job's status, tool-run progress, and findings count all change
/// server-side without any user action.
const ACTIVE_JOB_POLL_MS = 3000;

export const vulnKeys = {
  all: ["vuln"] as const,
  jobsForTarget: (targetId: string) => ["vuln", "jobs", "target", targetId] as const,
  jobsForProject: (projectId: string) => ["vuln", "jobs", "project", projectId] as const,
  jobsRecent: (query: ListVulnScanJobsQueryDto = {}) => ["vuln", "jobs", "recent", query] as const,
  job: (id: string) => ["vuln", "jobs", "detail", id] as const,
  jobFindings: (jobId: string) => ["vuln", "findings", "job", jobId] as const,
  findings: (query: ListVulnFindingsQueryDto = {}) => ["vuln", "findings", "list", query] as const,
  targetFindings: (targetId: string) => ["vuln", "findings", "target", targetId] as const,
  finding: (id: string) => ["vuln", "findings", "detail", id] as const,
  templates: ["vuln", "templates"] as const,
  dashboard: ["vuln", "dashboard"] as const,
  scannerHistory: ["vuln", "scanners", "history"] as const,
};

export function useVulnScanJobsForTarget(targetId: string) {
  return useQuery({
    queryKey: vulnKeys.jobsForTarget(targetId),
    queryFn: () => vulnApi.listVulnScanJobsForTarget(targetId),
    enabled: Boolean(targetId),
  });
}

export function useVulnScanJobsForProject(projectId: string) {
  return useQuery({
    queryKey: vulnKeys.jobsForProject(projectId),
    queryFn: () => vulnApi.listVulnScanJobsForProject(projectId),
    enabled: Boolean(projectId),
  });
}

export function useRecentVulnScanJobs(query: ListVulnScanJobsQueryDto = {}) {
  return useQuery({
    queryKey: vulnKeys.jobsRecent(query),
    queryFn: () => vulnApi.listRecentVulnScanJobs(query),
    refetchInterval: ACTIVE_JOB_POLL_MS,
  });
}

export function useVulnScanJob(id: string) {
  return useQuery({
    queryKey: vulnKeys.job(id),
    queryFn: () => vulnApi.getVulnScanJob(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || TERMINAL_STATUSES.includes(status)) return false;
      return ACTIVE_JOB_POLL_MS;
    },
  });
}

/// `jobActive` keeps the list fresh while the scan runs. The finished flag is
/// part of the key, so the list is fetched again the moment the job completes
/// instead of staying on the empty result loaded mid-scan.
export function useVulnScanJobFindings(jobId: string, enabled = true, jobActive = false) {
  return useQuery({
    queryKey: [...vulnKeys.jobFindings(jobId), jobActive ? "active" : "settled"],
    queryFn: () => vulnApi.listVulnScanJobFindings(jobId),
    enabled: Boolean(jobId) && enabled,
    refetchInterval: jobActive ? ACTIVE_JOB_POLL_MS : false,
  });
}

export function useVulnFindings(query: ListVulnFindingsQueryDto = {}) {
  return useQuery({
    queryKey: vulnKeys.findings(query),
    queryFn: () => vulnApi.listVulnFindings(query),
  });
}

export function useTargetVulnFindings(targetId: string) {
  return useQuery({
    queryKey: vulnKeys.targetFindings(targetId),
    queryFn: () => vulnApi.listVulnFindingsForTarget(targetId),
    enabled: Boolean(targetId),
  });
}

export function useVulnFinding(id: string) {
  return useQuery({
    queryKey: vulnKeys.finding(id),
    queryFn: () => vulnApi.getVulnFinding(id),
    enabled: Boolean(id),
  });
}

export function useVulnScanTemplates() {
  return useQuery({
    queryKey: vulnKeys.templates,
    queryFn: () => vulnApi.listVulnScanTemplates(),
  });
}

export function useVulnDashboardSummary() {
  return useQuery({
    queryKey: vulnKeys.dashboard,
    queryFn: () => vulnApi.getVulnDashboardSummary(),
    refetchInterval: ACTIVE_JOB_POLL_MS,
  });
}

export function useVulnScannerHistory() {
  return useQuery({
    queryKey: vulnKeys.scannerHistory,
    queryFn: () => vulnApi.listVulnScannerHistory(),
  });
}

function useInvalidateVuln() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: vulnKeys.all });
}

export function useCreateVulnScanJob(targetId: string) {
  const invalidate = useInvalidateVuln();
  return useMutation({
    mutationFn: (data: CreateVulnScanJobRequestDto) => vulnApi.createVulnScanJob(targetId, data),
    onSuccess: invalidate,
  });
}

export function useStopVulnScanJob() {
  const invalidate = useInvalidateVuln();
  return useMutation({
    mutationFn: (id: string) => vulnApi.stopVulnScanJob(id),
    onSuccess: invalidate,
  });
}

export function usePauseVulnScanJob() {
  const invalidate = useInvalidateVuln();
  return useMutation({
    mutationFn: (id: string) => vulnApi.pauseVulnScanJob(id),
    onSuccess: invalidate,
  });
}

export function useResumeVulnScanJob() {
  const invalidate = useInvalidateVuln();
  return useMutation({
    mutationFn: (id: string) => vulnApi.resumeVulnScanJob(id),
    onSuccess: invalidate,
  });
}

export function useRetryVulnScanJob() {
  const invalidate = useInvalidateVuln();
  return useMutation({
    mutationFn: (id: string) => vulnApi.retryVulnScanJob(id),
    onSuccess: invalidate,
  });
}

export function useUpdateVulnFindingStatus() {
  const invalidate = useInvalidateVuln();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateVulnFindingStatusRequestDto }) =>
      vulnApi.updateVulnFindingStatus(id, data),
    onSuccess: invalidate,
  });
}

export function useBulkUpdateVulnFindings() {
  const invalidate = useInvalidateVuln();
  return useMutation({
    mutationFn: (data: BulkUpdateVulnFindingsRequestDto) => vulnApi.bulkUpdateVulnFindings(data),
    onSuccess: invalidate,
  });
}

export function useCreateVulnScanTemplate() {
  const invalidate = useInvalidateVuln();
  return useMutation({
    mutationFn: (data: CreateVulnScanTemplateRequestDto) => vulnApi.createVulnScanTemplate(data),
    onSuccess: invalidate,
  });
}

export function useDeleteVulnScanTemplate() {
  const invalidate = useInvalidateVuln();
  return useMutation({
    mutationFn: (id: string) => vulnApi.deleteVulnScanTemplate(id),
    onSuccess: invalidate,
  });
}

/// Why the log stream is not delivering. The hook does not know the user's
/// language, so it reports the cause and the retry state; the view translates.
export interface LogStreamError {
  cause: { kind: "status"; status: number } | { kind: "disconnected" };
  /// Attempt in progress, or null once the hook has given up.
  attempt: number | null;
  max: number;
}

export interface UseVulnScanJobLogsResult {
  logs: VulnScanJobLogDto[];
  connected: boolean;
  error: LogStreamError | null;
}

/// Thrown for a non-OK stream response so the cause survives to the catch block.
class LogStreamStatusError extends Error {
  constructor(readonly status: number) {
    super(`Log stream failed with status ${status}`);
  }
}

/// Identical approach to Recon's useReconJobLogs (manual fetch+ReadableStream
/// SSE read, not EventSource) — see that hook's comment for why: the
/// browser's native EventSource can't attach the Bearer JWT this endpoint
/// requires.
///
/// Module 18 — task #525 (Phase 23: frontend reliability audit). Same
/// bounded exponential-backoff auto-reconnect added here as in
/// useReconJobLogs — see that hook's doc comment for the full rationale
/// (including why the AI chat/agent orchestration streams deliberately do
/// NOT get the same treatment in this phase).
const MAX_RECONNECT_ATTEMPTS = 5;

export function useVulnScanJobLogs(jobId: string, enabled: boolean): UseVulnScanJobLogsResult {
  const [logs, setLogs] = React.useState<VulnScanJobLogDto[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<LogStreamError | null>(null);

  React.useEffect(() => {
    if (!enabled || !jobId) return;
    const controller = new AbortController();
    setLogs([]);
    setError(null);
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // The stream replays every stored line from the start on each connection,
    // so after a reconnect the same lines arrive again. Keep each id once.
    const seen = new Set<string>();

    async function run(): Promise<void> {
      try {
        const accessToken = useAuthStore.getState().accessToken;
        const response = await fetch(`${API_BASE_URL}${VULN_SCAN_JOB_ENDPOINTS.logsStream(jobId)}`, {
          headers: {
            Accept: "text/event-stream",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new LogStreamStatusError(response.status);
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
              const entry = JSON.parse(dataLines.join("")) as VulnScanJobLogDto;
              if (seen.has(entry.id)) continue;
              seen.add(entry.id);
              setLogs((prev) => [...prev, entry]);
            } catch {
              // Non-JSON keep-alive / comment frame — ignore.
            }
          }
        }
        // Normal terminal-state close (see streamLogs()'s doc comment on
        // the backend) — reached via `break`, not `catch`, so no
        // reconnect is attempted.
      } catch (err) {
        if (controller.signal.aborted) return;
        const cause: LogStreamError["cause"] =
          err instanceof LogStreamStatusError
            ? { kind: "status", status: err.status }
            : { kind: "disconnected" };
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          attempt += 1;
          setError({ cause, attempt, max: MAX_RECONNECT_ATTEMPTS });
          const delayMs = 1000 * 2 ** (attempt - 1);
          retryTimer = setTimeout(() => void run(), delayMs);
          return;
        }
        setError({ cause, attempt: null, max: MAX_RECONNECT_ATTEMPTS });
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
