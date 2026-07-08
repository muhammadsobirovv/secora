import type { ProjectStatus } from "./projects.js";

export type WorkspaceMemberRole = "OWNER" | "ADMIN" | "MEMBER";

export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMemberDto {
  userId: string;
  role: WorkspaceMemberRole;
  joinedAt: string;
}

export interface WorkspaceSettingsDto {
  defaultProjectStatus: ProjectStatus;
}

export interface UpdateWorkspaceRequestDto {
  name?: string;
  description?: string;
}

export interface UpdateWorkspaceSettingsRequestDto {
  defaultProjectStatus?: ProjectStatus;
}
