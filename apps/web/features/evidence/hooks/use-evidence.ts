"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as evidenceApi from "@/lib/api/evidence";
import type { CreateEvidenceRequestDto, UpdateEvidenceRequestDto } from "@pentesthub/shared";

export const evidenceKeys = {
  all: ["evidence"] as const,
  list: (projectId: string, targetId?: string) => ["evidence", "list", projectId, targetId] as const,
  detail: (id: string) => ["evidence", "detail", id] as const,
};

export function useEvidenceList(projectId: string, targetId?: string) {
  return useQuery({
    queryKey: evidenceKeys.list(projectId, targetId),
    queryFn: () => evidenceApi.listEvidence(projectId, targetId),
    enabled: Boolean(projectId),
  });
}

export function useEvidenceItem(id: string) {
  return useQuery({
    queryKey: evidenceKeys.detail(id),
    queryFn: () => evidenceApi.getEvidence(id),
    enabled: Boolean(id),
  });
}

function useInvalidateEvidence() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: evidenceKeys.all });
}

export function useCreateEvidence(projectId: string) {
  const invalidate = useInvalidateEvidence();
  return useMutation({
    mutationFn: (data: CreateEvidenceRequestDto) => evidenceApi.createEvidence(projectId, data),
    onSuccess: invalidate,
  });
}

export function useUpdateEvidence(id: string) {
  const invalidate = useInvalidateEvidence();
  return useMutation({
    mutationFn: (data: UpdateEvidenceRequestDto) => evidenceApi.updateEvidence(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteEvidence() {
  const invalidate = useInvalidateEvidence();
  return useMutation({
    mutationFn: (id: string) => evidenceApi.deleteEvidence(id),
    onSuccess: invalidate,
  });
}
