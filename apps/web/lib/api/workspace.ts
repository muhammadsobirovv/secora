import { WORKSPACE_ENDPOINTS } from "@pentesthub/shared";
import type {
  UpdateWorkspaceRequestDto,
  UpdateWorkspaceSettingsRequestDto,
  WorkspaceDto,
  WorkspaceMemberDto,
  WorkspaceSettingsDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

export function getWorkspace() {
  return apiFetch<WorkspaceDto>(WORKSPACE_ENDPOINTS.get);
}

export function updateWorkspace(data: UpdateWorkspaceRequestDto) {
  return apiFetch<WorkspaceDto>(WORKSPACE_ENDPOINTS.update, { method: "PATCH", body: data });
}

export function updateWorkspaceSettings(data: UpdateWorkspaceSettingsRequestDto) {
  return apiFetch<WorkspaceSettingsDto>(WORKSPACE_ENDPOINTS.settings, { method: "PATCH", body: data });
}

export function uploadWorkspaceAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<WorkspaceDto>(WORKSPACE_ENDPOINTS.uploadAvatar, { method: "POST", body: formData });
}

export function listWorkspaceMembers() {
  return apiFetch<WorkspaceMemberDto[]>(WORKSPACE_ENDPOINTS.members);
}
