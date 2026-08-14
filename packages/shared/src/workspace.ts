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
  /// Module 15 — task #352 (demo mode). True for a sandbox provisioned by
  /// POST /demo/session rather than registration. `apps/web` uses this to
  /// show a persistent "you're in a demo — data resets" banner and to
  /// explain why new recon/vuln scans are rejected.
  isDemo: boolean;
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
