import type { TagDto } from "./tags.js";

export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
export type ProjectVisibility = "PRIVATE" | "WORKSPACE" | "PUBLIC";
export type ProjectMemberRole = "OWNER" | "CONTRIBUTOR" | "VIEWER";

export interface ProjectDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  createdBy: string;
  isFavorite: boolean;
  tags: TagDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemberDto {
  userId: string;
  role: ProjectMemberRole;
  addedAt: string;
}

export interface CreateProjectRequestDto {
  name: string;
  description?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
}

export interface UpdateProjectRequestDto {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
}

export interface AddProjectMemberRequestDto {
  userId: string;
  role?: ProjectMemberRole;
}

export interface ListProjectsQueryDto {
  status?: ProjectStatus;
  favoritesOnly?: boolean;
  tagId?: string;
}
