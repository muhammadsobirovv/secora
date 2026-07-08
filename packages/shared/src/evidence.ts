export type EvidenceType =
  | "SCREENSHOT"
  | "HTTP_REQUEST"
  | "HTTP_RESPONSE"
  | "FILE"
  | "LOG"
  | "VIDEO";

export interface EvidenceDto {
  id: string;
  projectId: string;
  targetId: string | null;
  type: EvidenceType;
  title: string;
  description: string | null;
  textContent: string | null;
  checksum: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEvidenceRequestDto {
  type: EvidenceType;
  title: string;
  description?: string;
  textContent?: string;
  targetId?: string;
}

export interface UpdateEvidenceRequestDto {
  title?: string;
  description?: string;
  textContent?: string;
}
