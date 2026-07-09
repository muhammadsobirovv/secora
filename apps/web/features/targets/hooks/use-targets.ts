"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as targetsApi from "@/lib/api/targets";
import type { CreateTargetRequestDto, ListTargetsQueryDto, UpdateTargetRequestDto } from "@pentesthub/shared";

export const targetKeys = {
  all: ["targets"] as const,
  list: (projectId: string, filter: ListTargetsQueryDto = {}) =>
    ["targets", "list", projectId, filter] as const,
  detail: (id: string) => ["targets", "detail", id] as const,
};

export function useTargets(projectId: string, filter: ListTargetsQueryDto = {}) {
  return useQuery({
    queryKey: targetKeys.list(projectId, filter),
    queryFn: () => targetsApi.listTargets(projectId, filter),
    enabled: Boolean(projectId),
  });
}

export function useTarget(id: string) {
  return useQuery({
    queryKey: targetKeys.detail(id),
    queryFn: () => targetsApi.getTarget(id),
    enabled: Boolean(id),
  });
}

function useInvalidateTargets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: targetKeys.all });
}

export function useCreateTarget(projectId: string) {
  const invalidate = useInvalidateTargets();
  return useMutation({
    mutationFn: (data: CreateTargetRequestDto) => targetsApi.createTarget(projectId, data),
    onSuccess: invalidate,
  });
}

export function useUpdateTarget(id: string) {
  const invalidate = useInvalidateTargets();
  return useMutation({
    mutationFn: (data: UpdateTargetRequestDto) => targetsApi.updateTarget(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteTarget() {
  const invalidate = useInvalidateTargets();
  return useMutation({
    mutationFn: (id: string) => targetsApi.deleteTarget(id),
    onSuccess: invalidate,
  });
}
