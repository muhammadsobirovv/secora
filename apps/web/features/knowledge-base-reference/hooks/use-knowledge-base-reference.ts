"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SearchKnowledgeBaseReferenceQueryDto,
  UpsertKnowledgeBaseReferenceEntryRequestDto,
} from "@pentesthub/shared";
import * as kbApi from "@/lib/api/knowledge-base-reference";

export const knowledgeBaseReferenceKeys = {
  all: ["knowledge-base-reference"] as const,
  list: (framework?: string) => ["knowledge-base-reference", "list", framework ?? "all"] as const,
  search: (query: SearchKnowledgeBaseReferenceQueryDto) =>
    ["knowledge-base-reference", "search", query] as const,
  entry: (id: string) => ["knowledge-base-reference", "detail", id] as const,
};

export function useKnowledgeBaseReferences(framework?: string) {
  return useQuery({
    queryKey: knowledgeBaseReferenceKeys.list(framework),
    queryFn: () => kbApi.listKnowledgeBaseReferences(framework),
  });
}

export function useSearchKnowledgeBaseReferences(query: SearchKnowledgeBaseReferenceQueryDto, enabled: boolean) {
  return useQuery({
    queryKey: knowledgeBaseReferenceKeys.search(query),
    queryFn: () => kbApi.searchKnowledgeBaseReferences(query),
    enabled: enabled && query.query.trim().length > 0,
  });
}

export function useKnowledgeBaseReference(id: string) {
  return useQuery({
    queryKey: knowledgeBaseReferenceKeys.entry(id),
    queryFn: () => kbApi.getKnowledgeBaseReference(id),
    enabled: Boolean(id),
  });
}

function useInvalidateKnowledgeBaseReference() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: knowledgeBaseReferenceKeys.all });
}

export function useUpsertKnowledgeBaseReference() {
  const invalidate = useInvalidateKnowledgeBaseReference();
  return useMutation({
    mutationFn: (data: UpsertKnowledgeBaseReferenceEntryRequestDto) => kbApi.upsertKnowledgeBaseReference(data),
    onSuccess: invalidate,
  });
}

export function useDeleteKnowledgeBaseReference() {
  const invalidate = useInvalidateKnowledgeBaseReference();
  return useMutation({
    mutationFn: (id: string) => kbApi.deleteKnowledgeBaseReference(id),
    onSuccess: invalidate,
  });
}

export function useReindexKnowledgeBaseReferences() {
  return useMutation({
    mutationFn: () => kbApi.reindexKnowledgeBaseReferences(),
  });
}
