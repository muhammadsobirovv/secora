// Module 16 — Research Session (task #371).

export type ResearchSessionStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";

export type ResearchSessionEntityType =
  | "RECON_JOB" | "VULN_SCAN_JOB" | "BUGBOUNTY_FINDING" | "VULN_FINDING" | "NOTE"
  | "EVIDENCE" | "AD_HOC_COMMAND" | "AI_CONVERSATION" | "AI_INVESTIGATION_SESSION"
  | "BUG_REPORT" | "ACTIVITY_EVENT";

export interface ResearchSessionDto {
  id: string;
  projectId: string | null;
  targetId: string | null;
  programId: string | null;
  name: string;
  description: string | null;
  status: ResearchSessionStatus;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSessionLinkDto {
  id: string;
  entityType: ResearchSessionEntityType;
  entityId: string;
  linkedAt: string;
}

export interface CreateResearchSessionRequestDto {
  name: string;
  description?: string;
  projectId?: string;
  targetId?: string;
  programId?: string;
}

export interface LinkResearchSessionEntityRequestDto {
  entityType: ResearchSessionEntityType;
  entityId: string;
}
