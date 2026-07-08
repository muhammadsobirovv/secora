export type AttachableType = "WORKSPACE" | "PROJECT" | "TARGET" | "NOTE" | "EVIDENCE";

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
