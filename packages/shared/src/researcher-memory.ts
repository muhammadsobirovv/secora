// Module 16 — AI Memory / researcher memory (task #397). Editable,
// searchable, deletable, exportable — reuses the existing Module 11 RAG
// store (AiMemoryChunk, sourceType RESEARCHER_MEMORY) for the searchable
// half rather than a second retrieval mechanism.

export type ResearcherMemoryKind =
  | "PREFERENCE" | "PROJECT_CONTEXT" | "NOTE" | "IMPORTANT_FINDING" | "DECISION" | "CUSTOM_INSTRUCTION";

export interface ResearcherMemoryEntryDto {
  id: string;
  kind: ResearcherMemoryKind;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateResearcherMemoryEntryRequestDto {
  kind: ResearcherMemoryKind;
  title: string;
  content: string;
  tags?: string[];
}

export interface UpdateResearcherMemoryEntryRequestDto {
  title?: string;
  content?: string;
  tags?: string[];
}
