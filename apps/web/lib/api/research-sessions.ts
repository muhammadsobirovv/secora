import { RESEARCH_SESSION_ENDPOINTS } from "@pentesthub/shared";
import type {
  CreateResearchSessionRequestDto,
  LinkResearchSessionEntityRequestDto,
  ResearchSessionDto,
  ResearchSessionLinkDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

// Module 16 — task #371. Workspace is resolved server-side from the
// caller's JWT (see ResearchSessionController's doc comment) — no
// workspaceId param here, matching the platform-wide convention (targets,
// projects, notes, ...).
export function listResearchSessions() {
  return apiFetch<ResearchSessionDto[]>(RESEARCH_SESSION_ENDPOINTS.list());
}

export function createResearchSession(data: CreateResearchSessionRequestDto) {
  return apiFetch<ResearchSessionDto>(RESEARCH_SESSION_ENDPOINTS.create(), {
    method: "POST",
    body: data,
  });
}

export function getResearchSession(id: string) {
  return apiFetch<ResearchSessionDto>(RESEARCH_SESSION_ENDPOINTS.session(id));
}

export function pauseResearchSession(id: string) {
  return apiFetch<ResearchSessionDto>(`${RESEARCH_SESSION_ENDPOINTS.session(id)}/pause`, {
    method: "PATCH",
  });
}

export function resumeResearchSession(id: string) {
  return apiFetch<ResearchSessionDto>(`${RESEARCH_SESSION_ENDPOINTS.session(id)}/resume`, {
    method: "PATCH",
  });
}

export function completeResearchSession(id: string) {
  return apiFetch<ResearchSessionDto>(`${RESEARCH_SESSION_ENDPOINTS.session(id)}/complete`, {
    method: "PATCH",
  });
}

export function archiveResearchSession(id: string) {
  return apiFetch<ResearchSessionDto>(`${RESEARCH_SESSION_ENDPOINTS.session(id)}/archive`, {
    method: "PATCH",
  });
}

export function listResearchSessionLinks(id: string) {
  return apiFetch<ResearchSessionLinkDto[]>(RESEARCH_SESSION_ENDPOINTS.link(id));
}

export function linkResearchSessionEntity(
  id: string,
  data: LinkResearchSessionEntityRequestDto,
) {
  return apiFetch<ResearchSessionLinkDto>(RESEARCH_SESSION_ENDPOINTS.link(id), {
    method: "POST",
    body: data,
  });
}
