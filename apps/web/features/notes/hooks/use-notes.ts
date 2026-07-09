"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as notesApi from "@/lib/api/notes";
import type { CreateNoteRequestDto, UpdateNoteRequestDto } from "@pentesthub/shared";

export const noteKeys = {
  all: ["notes"] as const,
  list: (projectId: string, targetId?: string) => ["notes", "list", projectId, targetId] as const,
  detail: (id: string) => ["notes", "detail", id] as const,
};

export function useNotes(projectId: string, targetId?: string) {
  return useQuery({
    queryKey: noteKeys.list(projectId, targetId),
    queryFn: () => notesApi.listNotes(projectId, targetId),
    enabled: Boolean(projectId),
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: () => notesApi.getNote(id),
    enabled: Boolean(id),
  });
}

function useInvalidateNotes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: noteKeys.all });
}

export function useCreateNote(projectId: string) {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: (data: CreateNoteRequestDto) => notesApi.createNote(projectId, data),
    onSuccess: invalidate,
  });
}

export function useUpdateNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateNoteRequestDto) => notesApi.updateNote(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(noteKeys.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: noteKeys.all, exact: false });
    },
  });
}

export function useDeleteNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: (id: string) => notesApi.deleteNote(id),
    onSuccess: invalidate,
  });
}
