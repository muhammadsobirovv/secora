"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as authApi from "@/lib/api/auth";

const SESSIONS_KEY = ["sessions"] as const;

export function useSessions() {
  return useQuery({ queryKey: SESSIONS_KEY, queryFn: authApi.listSessions });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}
