"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as workspaceApi from "@/lib/api/workspace";
import type { UpdateWorkspaceRequestDto } from "@pentesthub/shared";

export const workspaceKeys = {
  detail: ["workspace"] as const,
  members: ["workspace", "members"] as const,
};

export function useWorkspace() {
  return useQuery({ queryKey: workspaceKeys.detail, queryFn: workspaceApi.getWorkspace });
}

export function useWorkspaceMembers() {
  return useQuery({ queryKey: workspaceKeys.members, queryFn: workspaceApi.listWorkspaceMembers });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateWorkspaceRequestDto) => workspaceApi.updateWorkspace(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.detail }),
  });
}

export function useUploadWorkspaceAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => workspaceApi.uploadWorkspaceAvatar(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.detail }),
  });
}
