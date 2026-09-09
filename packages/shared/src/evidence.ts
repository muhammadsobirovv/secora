export type EvidenceType =
  | "SCREENSHOT"
  | "HTTP_REQUEST"
  | "HTTP_RESPONSE"
  | "FILE"
  | "LOG"
  | "VIDEO"
  // Added for Module 4 (Vulnerability Engine) — a scanner's fuzz payload
  // and the exact command used to reproduce a finding. Purely additive;
  // every pre-existing EvidenceType value/consumer is unaffected.
  | "PAYLOAD"
  | "COMMAND"
  // Module 16 additions -- Evidence Workspace section asked for audio
  // capture and AI-analysis snapshots alongside the existing kinds.
  | "AUDIO"
  | "AI_ANALYSIS";

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
