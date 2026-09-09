"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as apiKeysApi from "@/lib/api/api-keys";
import type { CreateApiKeyRequestDto } from "@pentesthub/shared";

export const apiKeysKeys = {
  list: ["api-keys"] as const,
};

export function useApiKeys() {
  return useQuery({ queryKey: apiKeysKeys.list, queryFn: apiKeysApi.listApiKeys });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApiKeyRequestDto) => apiKeysApi.createApiKey(data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: apiKeysKeys.list }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiKeysApi.revokeApiKey(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: apiKeysKeys.list }),
  });
}

export function useRotateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiKeysApi.rotateApiKey(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: apiKeysKeys.list }),
  });
}
