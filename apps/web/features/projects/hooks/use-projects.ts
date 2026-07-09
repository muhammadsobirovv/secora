"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as projectsApi from "@/lib/api/projects";
import type {
  CreateProjectRequestDto,
  ListProjectsQueryDto,
  UpdateProjectRequestDto,
} from "@pentesthub/shared";

export const projectKeys = {
  all: ["projects"] as const,
  list: (filter: ListProjectsQueryDto = {}) => ["projects", "list", filter] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  members: (id: string) => ["projects", "detail", id, "members"] as const,
};

export function useProjects(filter: ListProjectsQueryDto = {}) {
  return useQuery({
    queryKey: projectKeys.list(filter),
    queryFn: () => projectsApi.listProjects(filter),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => projectsApi.getProject(id),
    enabled: Boolean(id),
  });
}

export function useProjectMembers(id: string) {
  return useQuery({
    queryKey: projectKeys.members(id),
    queryFn: () => projectsApi.listProjectMembers(id),
    enabled: Boolean(id),
  });
}

function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: projectKeys.all });
}

export function useCreateProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (data: CreateProjectRequestDto) => projectsApi.createProject(data),
    onSuccess: invalidate,
  });
}

export function useUpdateProject(id: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (data: UpdateProjectRequestDto) => projectsApi.updateProject(id, data),
    onSuccess: invalidate,
  });
}

export function useArchiveProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (id: string) => projectsApi.archiveProject(id),
    onSuccess: invalidate,
  });
}

export function useRestoreProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (id: string) => projectsApi.restoreProject(id),
    onSuccess: invalidate,
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (id: string) => projectsApi.deleteProject(id),
    onSuccess: invalidate,
  });
}

export function useToggleFavoriteProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      isFavorite ? projectsApi.unfavoriteProject(id) : projectsApi.favoriteProject(id),
    onSuccess: invalidate,
  });
}
