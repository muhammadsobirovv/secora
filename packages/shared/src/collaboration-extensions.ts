// Module 16 — Collaboration extensions: Watchers & Reactions (task #390),
// Public Sharing (task #392). Extends Module 9's existing Comment/
// Mention/Assignment layer rather than replacing it.

export type CollaborationEntityType = "BUGBOUNTY_FINDING" | "BUG_REPORT" | "COMMENT" | "RESEARCH_SESSION";

export interface WatcherDto {
  id: string;
  entityType: CollaborationEntityType;
  entityId: string;
  userId: string;
  createdAt: string;
}

export interface ReactionDto {
  id: string;
  entityType: CollaborationEntityType;
  entityId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface ToggleWatcherRequestDto {
  entityType: CollaborationEntityType;
  entityId: string;
}

export interface ToggleReactionRequestDto {
  entityType: CollaborationEntityType;
  entityId: string;
  emoji: string;
}

// --- Public sharing ----------------------------------------------------------

export type ShareResourceType = "REPORT" | "FINDING" | "EVIDENCE" | "DASHBOARD" | "PROJECT";
export type SharePermission = "VIEW" | "COMMENT";

export interface ShareLinkDto {
  id: string;
  resourceType: ShareResourceType;
  resourceId: string;
  token: string;
  hasPassword: boolean;
  permission: SharePermission;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
}

export interface CreateShareLinkRequestDto {
  resourceType: ShareResourceType;
  resourceId: string;
  permission?: SharePermission;
  password?: string;
  expiresInDays?: number;
}

/// Returned by the public (unauthenticated) resolve endpoint —
/// deliberately excludes `workspaceId`, `createdBy`, and every other
/// internal identifier; a share link only ever hands the recipient the
/// resource itself, never the tenant it lives in.
export interface ResolvedShareLinkDto {
  resourceType: ShareResourceType;
  resourceId: string;
  title: string;
  permission: SharePermission;
}

export interface AccessShareLinkRequestDto {
  password?: string;
}

