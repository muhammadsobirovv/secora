"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePlaybookRequestDto,
  DecidePlaybookApprovalRequestDto,
  StartPlaybookExecutionRequestDto,
  UpdatePlaybookDraftRequestDto,
} from "@pentesthub/shared";
import * as playbooksApi from "@/lib/api/playbooks";

export const playbookKeys = {
  all: ["playbooks"] as const,
  list: (filter: { status?: string; category?: string } = {}) => ["playbooks", "list", filter] as const,
  detail: (id: string) => ["playbooks", "detail", id] as const,
  executions: (id: string) => ["playbooks", "executions", id] as const,
  execution: (executionId: string) => ["playbooks", "execution", executionId] as const,
  approvals: ["playbooks", "approvals"] as const,
};

function useInvalidatePlaybooks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: playbookKeys.all });
}

export function usePlaybooks(filter: { status?: string; category?: string } = {}) {
  return useQuery({ queryKey: playbookKeys.list(filter), queryFn: () => playbooksApi.listPlaybooks(filter) });
}

export function usePlaybook(id: string) {
  return useQuery({
    queryKey: playbookKeys.detail(id),
    queryFn: () => playbooksApi.getPlaybook(id),
    enabled: Boolean(id),
  });
}

export function useCreatePlaybook() {
  const invalidate = useInvalidatePlaybooks();
  return useMutation({
    mutationFn: (data: CreatePlaybookRequestDto) => playbooksApi.createPlaybook(data),
    onSuccess: invalidate,
  });
}

export function useUpdatePlaybookDraft(id: string) {
  const invalidate = useInvalidatePlaybooks();
  return useMutation({
    mutationFn: (data: UpdatePlaybookDraftRequestDto) => playbooksApi.updatePlaybookDraft(id, data),
    onSuccess: invalidate,
  });
}

export function usePublishPlaybook() {
  const invalidate = useInvalidatePlaybooks();
  return useMutation({ mutationFn: (id: string) => playbooksApi.publishPlaybook(id), onSuccess: invalidate });
}

export function useClonePlaybook() {
  const invalidate = useInvalidatePlaybooks();
  return useMutation({ mutationFn: (id: string) => playbooksApi.clonePlaybook(id), onSuccess: invalidate });
}

export function useArchivePlaybook() {
  const invalidate = useInvalidatePlaybooks();
  return useMutation({ mutationFn: (id: string) => playbooksApi.archivePlaybook(id), onSuccess: invalidate });
}

export function useValidatePlaybook() {
  return useMutation({ mutationFn: (id: string) => playbooksApi.validatePlaybook(id) });
}

export function useDryRunPlaybook(id: string) {
  return useMutation({
    mutationFn: (data: StartPlaybookExecutionRequestDto) => playbooksApi.dryRunPlaybook(id, data),
  });
}

export function useRunPlaybook(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StartPlaybookExecutionRequestDto) => playbooksApi.runPlaybook(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playbookKeys.executions(id) }),
  });
}

export function usePlaybookExecutions(id: string) {
  return useQuery({
    queryKey: playbookKeys.executions(id),
    queryFn: () => playbooksApi.listPlaybookExecutions(id),
    enabled: Boolean(id),
  });
}

export function usePlaybookExecution(executionId: string, options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: playbookKeys.execution(executionId),
    queryFn: () => playbooksApi.getPlaybookExecution(executionId),
    enabled: Boolean(executionId),
    refetchInterval: options.refetchInterval,
  });
}

export function usePlaybookApprovals() {
  return useQuery({ queryKey: playbookKeys.approvals, queryFn: () => playbooksApi.listPlaybookApprovals() });
}

export function useDecidePlaybookApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DecidePlaybookApprovalRequestDto }) =>
      playbooksApi.decidePlaybookApproval(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playbookKeys.approvals }),
  });
}
