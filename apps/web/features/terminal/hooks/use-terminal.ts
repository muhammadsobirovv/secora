"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RunAdHocCommandRequestDto } from "@pentesthub/shared";
import * as terminalApi from "@/lib/api/terminal";

export const terminalKeys = {
  registry: ["terminal", "registry"] as const,
  history: (filter: { targetId?: string; status?: string } = {}) => ["terminal", "history", filter] as const,
  command: (id: string) => ["terminal", "command", id] as const,
};

export function useTerminalCommandRegistry() {
  return useQuery({ queryKey: terminalKeys.registry, queryFn: () => terminalApi.listTerminalCommandRegistry() });
}

export function useTerminalHistory(filter: { targetId?: string; status?: string } = {}) {
  return useQuery({ queryKey: terminalKeys.history(filter), queryFn: () => terminalApi.listTerminalHistory(filter) });
}

export function useRunTerminalCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RunAdHocCommandRequestDto) => terminalApi.runTerminalCommand(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["terminal", "history"] }),
  });
}

export function useTerminalCommand(id: string, options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: terminalKeys.command(id),
    queryFn: () => terminalApi.getTerminalCommand(id),
    enabled: Boolean(id),
    refetchInterval: options.refetchInterval,
  });
}
