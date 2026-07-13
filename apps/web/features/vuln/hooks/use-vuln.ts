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

export function useVulnScanJobFindings(jobId: string, enabled = true) {
  return useQuery({
    queryKey: vulnKeys.jobFindings(jobId),
    queryFn: () => vulnApi.listVulnScanJobFindings(jobId),
    enabled: Boolean(jobId) && enabled,
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

interface UseVulnScanJobLogsResult {
  logs: VulnScanJobLogDto[];
  connected: boolean;
  error: string | null;
}

/// Identical approach to Recon's useReconJobLogs (manual fetch+ReadableStream
/// SSE read, not EventSource) — see that hook's comment for why: the
/// browser's native EventSource can't attach the Bearer JWT this endpoint
/// requires.
export function useVulnScanJobLogs(jobId: string, enabled: boolean): UseVulnScanJobLogsResult {
  const [logs, setLogs] = React.useState<VulnScanJobLogDto[]>([]);
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
        const response = await fetch(`${API_BASE_URL}${VULN_SCAN_JOB_ENDPOINTS.logsStream(jobId)}`, {
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
              const entry = JSON.parse(dataLines.join("")) as VulnScanJobLogDto;
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
