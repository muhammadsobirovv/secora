// Module 11 — AI Knowledge Base (searchable cybersecurity reference index).
// Distinct from Module 9's KnowledgeBaseNote (knowledge-base.ts, if present)
// which is user-authored/workspace-scoped content (notes, cheat sheets,
// methodologies); KnowledgeBaseReferenceEntry is a system-wide, read-mostly
// canonical catalog (OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE) that the AI
// Knowledge Base indexes into the same RAG store via AiMemorySourceType
// "KNOWLEDGE_BASE_REFERENCE" (see ai.ts).

export const KNOWLEDGE_BASE_REFERENCE_FRAMEWORKS = [
  "OWASP",
  "CWE",
  "CAPEC",
  "MITRE_ATTACK",
  "NIST",
  "CVE",
] as const;

export type KnowledgeBaseReferenceFramework = (typeof KNOWLEDGE_BASE_REFERENCE_FRAMEWORKS)[number];

export interface KnowledgeBaseReferenceEntryDto {
  id: string;
  framework: KnowledgeBaseReferenceFramework;
  /// The framework's own identifier, e.g. "A03:2021", "CWE-79", "CAPEC-66",
  /// "T1059", "CVE-2024-12345".
  code: string;
  title: string;
  summary: string;
  url: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertKnowledgeBaseReferenceEntryRequestDto {
  framework: KnowledgeBaseReferenceFramework;
  code: string;
  title: string;
  summary: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchKnowledgeBaseReferenceQueryDto {
  query: string;
  framework?: KnowledgeBaseReferenceFramework;
  limit?: number;
}

export interface KnowledgeBaseReferenceSearchResultDto {
  entry: KnowledgeBaseReferenceEntryDto;
  /// Cosine-similarity style relevance score from the semantic search, 0..1.
  score: number;
}
