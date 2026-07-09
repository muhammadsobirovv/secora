import { EVIDENCE_ENDPOINTS } from "@pentesthub/shared";
import type {
  CreateEvidenceRequestDto,
  EvidenceDto,
  UpdateEvidenceRequestDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listEvidence(projectId: string, targetId?: string) {
  const qs = targetId ? `?targetId=${targetId}` : "";
  return apiFetch<EvidenceDto[]>(`${EVIDENCE_ENDPOINTS.list(projectId)}${qs}`);
}

export function getEvidence(id: string) {
  return apiFetch<EvidenceDto>(EVIDENCE_ENDPOINTS.get(id));
}

export function createEvidence(projectId: string, data: CreateEvidenceRequestDto) {
  return apiFetch<EvidenceDto>(EVIDENCE_ENDPOINTS.create(projectId), { method: "POST", body: data });
}

export function updateEvidence(id: string, data: UpdateEvidenceRequestDto) {
  return apiFetch<EvidenceDto>(EVIDENCE_ENDPOINTS.update(id), { method: "PATCH", body: data });
}

export function deleteEvidence(id: string) {
  return apiFetch<void>(EVIDENCE_ENDPOINTS.delete(id), { method: "DELETE" });
}
