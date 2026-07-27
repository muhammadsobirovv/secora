import type {
  KnowledgeBaseReferenceEntryDto,
  KnowledgeBaseReferenceSearchResultDto,
  SearchKnowledgeBaseReferenceQueryDto,
  UpsertKnowledgeBaseReferenceEntryRequestDto,
} from "@pentesthub/shared";
import { KNOWLEDGE_BASE_REFERENCE_ENDPOINTS } from "@pentesthub/shared";
import { apiFetch } from "./client";

/// Module 11 — Frontend Copilot/Agent UI (task #237). API client for the
/// AI Knowledge Base's system-wide OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE
/// reference catalog (knowledge-base-reference.ts in @pentesthub/shared) —
/// distinct from Module 6/9's workspace-scoped KnowledgeBaseNote, which has
/// its own client under lib/api/knowledge-base.ts.
export function listKnowledgeBaseReferences(framework?: string) {
  const params = new URLSearchParams();
  if (framework) params.set("framework", framework);
  const qs = params.toString();
  return apiFetch<KnowledgeBaseReferenceEntryDto[]>(
    `${KNOWLEDGE_BASE_REFERENCE_ENDPOINTS.list}${qs ? `?${qs}` : ""}`,
  );
}

export function searchKnowledgeBaseReferences(query: SearchKnowledgeBaseReferenceQueryDto) {
  const params = new URLSearchParams();
  params.set("query", query.query);
  if (query.framework) params.set("framework", query.framework);
  if (query.limit) params.set("limit", String(query.limit));
  return apiFetch<KnowledgeBaseReferenceSearchResultDto[]>(
    `${KNOWLEDGE_BASE_REFERENCE_ENDPOINTS.search}?${params.toString()}`,
  );
}

export function getKnowledgeBaseReference(id: string) {
  return apiFetch<KnowledgeBaseReferenceEntryDto>(KNOWLEDGE_BASE_REFERENCE_ENDPOINTS.get(id));
}

export function upsertKnowledgeBaseReference(body: UpsertKnowledgeBaseReferenceEntryRequestDto) {
  return apiFetch<KnowledgeBaseReferenceEntryDto>(KNOWLEDGE_BASE_REFERENCE_ENDPOINTS.upsert, {
    method: "POST",
    body,
  });
}

export function deleteKnowledgeBaseReference(id: string) {
  return apiFetch<void>(KNOWLEDGE_BASE_REFERENCE_ENDPOINTS.delete(id), { method: "DELETE" });
}

export function reindexKnowledgeBaseReferences() {
  return apiFetch<{ indexed: number }>(KNOWLEDGE_BASE_REFERENCE_ENDPOINTS.reindex, { method: "PUT" });
}
