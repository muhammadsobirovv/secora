import { TERMINAL_ENDPOINTS } from "@pentesthub/shared";
import type { AdHocCommandDto, RunAdHocCommandRequestDto, TerminalCommandDefinitionDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

// Module 16 — Safe Terminal (task #388). Workspace/ownership are resolved
// server-side from the caller's JWT — this client never sends a
// workspaceId/projectId, matching AdHocCommandService's contract.

export function listTerminalCommandRegistry() {
  return apiFetch<TerminalCommandDefinitionDto[]>(`/${TERMINAL_ENDPOINTS.commandRegistry()}`);
}

export function runTerminalCommand(data: RunAdHocCommandRequestDto) {
  return apiFetch<AdHocCommandDto>(`/${TERMINAL_ENDPOINTS.run()}`, { method: "POST", body: data });
}

export function listTerminalHistory(query: { targetId?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (query.targetId) params.set("targetId", query.targetId);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiFetch<AdHocCommandDto[]>(`/${TERMINAL_ENDPOINTS.history()}${qs ? `?${qs}` : ""}`);
}

export function getTerminalCommand(id: string) {
  return apiFetch<AdHocCommandDto>(`/${TERMINAL_ENDPOINTS.command(id)}`);
}
