"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as preferencesApi from "@/lib/api/user-preferences";
import type { UpdateUserPreferencesRequestDto } from "@pentesthub/shared";

const PREFERENCES_KEY = ["preferences"] as const;

export function usePreferences() {
  return useQuery({ queryKey: PREFERENCES_KEY, queryFn: preferencesApi.getPreferences });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateUserPreferencesRequestDto) => preferencesApi.updatePreferences(data),
    onSuccess: (updated) => queryClient.setQueryData(PREFERENCES_KEY, updated),
  });
}
