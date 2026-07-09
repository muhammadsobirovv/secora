import { PROJECT_ENDPOINTS } from "@pentesthub/shared";
import type {
  AddProjectMemberRequestDto,
  CreateProjectRequestDto,
  ListProjectsQueryDto,
  ProjectDto,
  ProjectMemberDto,
  UpdateProjectRequestDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listProjects(filter: ListProjectsQueryDto = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.favoritesOnly) params.set("favoritesOnly", "true");
  if (filter.tagId) params.set("tagId", filter.tagId);
  const qs = params.toString();
  return apiFetch<ProjectDto[]>(`${PROJECT_ENDPOINTS.list}${qs ? `?${qs}` : ""}`);
}

export function getProject(id: string) {
  return apiFetch<ProjectDto>(PROJECT_ENDPOINTS.get(id));
}

export function createProject(data: CreateProjectRequestDto) {
  return apiFetch<ProjectDto>(PROJECT_ENDPOINTS.create, { method: "POST", body: data });
}

export function updateProject(id: string, data: UpdateProjectRequestDto) {
  return apiFetch<ProjectDto>(PROJECT_ENDPOINTS.update(id), { method: "PATCH", body: data });
}

export function archiveProject(id: string) {
  return apiFetch<ProjectDto>(PROJECT_ENDPOINTS.archive(id), { method: "POST" });
}

export function restoreProject(id: string) {
  return apiFetch<ProjectDto>(PROJECT_ENDPOINTS.restore(id), { method: "POST" });
}

export function deleteProject(id: string) {
  return apiFetch<void>(PROJECT_ENDPOINTS.delete(id), { method: "DELETE" });
}

export function favoriteProject(id: string) {
  return apiFetch<ProjectDto>(PROJECT_ENDPOINTS.favorite(id), { method: "POST" });
}

export function unfavoriteProject(id: string) {
  return apiFetch<ProjectDto>(PROJECT_ENDPOINTS.unfavorite(id), { method: "DELETE" });
}

export function listProjectMembers(id: string) {
  return apiFetch<ProjectMemberDto[]>(PROJECT_ENDPOINTS.members(id));
}

export function addProjectMember(id: string, data: AddProjectMemberRequestDto) {
  return apiFetch<ProjectMemberDto>(PROJECT_ENDPOINTS.members(id), { method: "POST", body: data });
}

export function removeProjectMember(id: string, userId: string) {
  return apiFetch<void>(PROJECT_ENDPOINTS.removeMember(id, userId), { method: "DELETE" });
}

export function tagProject(id: string, tagId: string) {
  return apiFetch<void>(PROJECT_ENDPOINTS.tag(id, tagId), { method: "POST" });
}

export function untagProject(id: string, tagId: string) {
  return apiFetch<void>(PROJECT_ENDPOINTS.tag(id, tagId), { method: "DELETE" });
}
