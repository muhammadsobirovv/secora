export type AttachableType =
  | "WORKSPACE"
  | "PROJECT"
  | "TARGET"
  | "NOTE"
  | "EVIDENCE"
  // Module 6 (Bug Bounty Workspace) additions -- see prisma/schema.prisma's
  // AttachableType enum comment; the Attachment table is reused as-is.
  | "KNOWLEDGE_BASE_NOTE"
  | "BUG_REPORT"
  // Module 17 -- Incident evidence (task #470/#14): incidents reuse the
  // existing generic Attachment mechanism -- see prisma/schema.prisma's
  // AttachableType enum comment.
  | "INCIDENT";

export interface AttachmentDto {
  id: string;
  workspaceId: string;
  attachableType: AttachableType;
  attachableId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedBy: string;
  createdAt: string;
}
