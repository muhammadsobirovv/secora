// Module 20 — Final Product Completion & Release. First frontend consumer
// of `API_KEY_ENDPOINTS` (packages/shared/src/bugbounty-os-endpoints.ts) —
// Module 9/15 built the entire backend (`ApiKeysController`,
// `CreateApiKeyHandler`/`RotateApiKeyHandler`/`RevokeApiKeyHandler`/
// `ListApiKeysHandler`) but the Settings → API Keys page was left as a
// permanent "coming soon" `EmptyState` stub. Personal keys only for now
// (no `workspaceId` passed) — matches this app's current single-workspace
// UX; a workspace key requires picking which workspace, which needs the
// same workspace-selector groundwork as the org-switcher gap.
import { API_KEY_ENDPOINTS } from "@pentesthub/shared";
import type { ApiKeyDto, CreateApiKeyRequestDto, CreateApiKeyResultDto, RotateApiKeyResultDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listApiKeys() {
  return apiFetch<ApiKeyDto[]>(API_KEY_ENDPOINTS.list);
}

export function createApiKey(data: CreateApiKeyRequestDto) {
  return apiFetch<CreateApiKeyResultDto>(API_KEY_ENDPOINTS.create, { method: "POST", body: data });
}

export function revokeApiKey(id: string) {
  return apiFetch<void>(API_KEY_ENDPOINTS.revoke(id), { method: "DELETE" });
}

export function rotateApiKey(id: string) {
  return apiFetch<RotateApiKeyResultDto>(API_KEY_ENDPOINTS.rotate(id), { method: "POST" });
}
