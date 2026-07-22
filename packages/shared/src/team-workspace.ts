// Module 10 — Team Workspace (enterprise collaboration): internal wiki,
// lightweight review/approval queue, and async internal team chat. See
// docs/adr/0010-enterprise-platform.md §7 for the scope boundary (REST-
// polled chat, not a websocket/presence system).

// ---------------------------------------------------------------------------
// Wiki
// ---------------------------------------------------------------------------

export interface WikiPageDto {
  id: string;
  organizationId: string | null;
  workspaceId: string;
  parentPageId: string | null;
  title: string;
  contentMarkdown: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWikiPageRequestDto {
  workspaceId: string;
  parentPageId?: string;
  title: string;
  contentMarkdown: string;
}

export interface UpdateWikiPageRequestDto {
  parentPageId?: string | null;
  title?: string;
  contentMarkdown?: string;
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export type ReviewQueueItemStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ReviewQueueItemDto {
  id: string;
  organizationId: string | null;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  submittedBy: string;
  assignedTo: string | null;
  status: ReviewQueueItemStatus;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface SubmitReviewQueueItemRequestDto {
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  assignedTo?: string;
  note?: string;
}

export interface DecideReviewQueueItemRequestDto {
  status: "APPROVED" | "REJECTED";
  note?: string;
}

// ---------------------------------------------------------------------------
// Internal chat
// ---------------------------------------------------------------------------

export interface InternalChatChannelDto {
  id: string;
  organizationId: string | null;
  workspaceId: string;
  name: string;
  isPrivate: boolean;
  createdBy: string;
  createdAt: string;
}

export interface CreateInternalChatChannelRequestDto {
  workspaceId: string;
  name: string;
  isPrivate?: boolean;
}

export interface InternalChatMessageDto {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface SendInternalChatMessageRequestDto {
  body: string;
}
