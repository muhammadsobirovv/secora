"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveResearchSession,
  completeResearchSession,
  createResearchSession,
  getResearchSession,
  linkResearchSessionEntity,
  listResearchSessionLinks,
  listResearchSessions,
  pauseResearchSession,
  resumeResearchSession,
} from "@/lib/api/research-sessions";

// Module 16 — task #371.
export const researchSessionKeys = {
  list: ["research-sessions"] as const,
  detail: (id: string) => ["research-sessions", id] as const,
  links: (id: string) => ["research-sessions", id, "links"] as const,
};

export function useResearchSessions() {
  return useQuery({
    queryKey: researchSessionKeys.list,
    queryFn: listResearchSessions,
  });
}

export function useResearchSession(id: string) {
  return useQuery({
    queryKey: researchSessionKeys.detail(id),
    queryFn: () => getResearchSession(id),
    enabled: !!id,
  });
}

export function useResearchSessionLinks(id: string) {
  return useQuery({
    queryKey: researchSessionKeys.links(id),
    queryFn: () => listResearchSessionLinks(id),
    enabled: !!id,
  });
}

export function useCreateResearchSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createResearchSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: researchSessionKeys.list });
    },
  });
}

function useResearchSessionTransition(
  fn: (id: string) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: researchSessionKeys.list });
      void queryClient.invalidateQueries({ queryKey: researchSessionKeys.detail(id as string) });
    },
  });
}

export function usePauseResearchSession() {
  return useResearchSessionTransition(pauseResearchSession);
}

export function useResumeResearchSession() {
  return useResearchSessionTransition(resumeResearchSession);
}

export function useCompleteResearchSession() {
  return useResearchSessionTransition(completeResearchSession);
}

export function useArchiveResearchSession() {
  return useResearchSessionTransition(archiveResearchSession);
}

export function useLinkResearchSessionEntity(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof linkResearchSessionEntity>[1]) =>
      linkResearchSessionEntity(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: researchSessionKeys.links(id) });
    },
  });
}
