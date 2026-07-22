import type { ProjectStatus } from "./projects.js";

// Module 9 adds MANAGER/TRIAGER/REVIEWER, additive to Module 1's
// OWNER/ADMIN/MEMBER — see docs/adr/0009-bug-bounty-operating-system.md
// and prisma/schema.prisma's WorkspaceMemberRole doc comment for the
// suggested permission ordering.
export type WorkspaceMemberRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "TRIAGER"
  | "REVIEWER"
  | "MEMBER";

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
