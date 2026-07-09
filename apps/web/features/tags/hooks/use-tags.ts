"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as tagsApi from "@/lib/api/tags";
import type { CreateTagRequestDto } from "@pentesthub/shared";

const TAGS_KEY = ["tags"] as const;

export function useTags() {
  return useQuery({ queryKey: TAGS_KEY, queryFn: tagsApi.listTags });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTagRequestDto) => tagsApi.createTag(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TAGS_KEY }),
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tagsApi.deleteTag(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TAGS_KEY }),
  });
}
